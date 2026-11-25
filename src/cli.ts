#!/usr/bin/env node
// pnpm arena <command>. Run `pnpm arena help` for the list.
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { corpusProject, setupCorpus } from './lib/corpus.ts';
import { type ThreadSetting, type Tool, availableOn, binaryPath, compareVersions, families, parseTool, variantIds } from './lib/linters.ts';
import { CORPUS_DIR, PLATFORM, RESULTS_DIR, ROOT } from './lib/paths.ts';
import { writeIndex, writeReport } from './lib/report.ts';
import { rules } from './lib/rules.ts';
import { run } from './lib/run.ts';
import { scrubber } from './lib/scrub.ts';
import { KEEP_VERSIONS, addTools, listTools, pnpmInstall, pruneTools, removeTools } from './lib/store.ts';
import { verifyRules } from './lib/verify.ts';
import { newVersions } from './lib/watch.ts';

const HELP = `lint-arena: JavaScript and TypeScript linters, side by side, across versions.

  pnpm arena tool list                      installed tools and their status here
  pnpm arena tool add <family@version>...   install linter versions; each family keeps its
                                            newest ${KEEP_VERSIONS}, so older ones are removed
      --allow-young              before the 7-day release age (adds a reviewed exception)
      --allow-trust-downgrade    accept a reviewed trust downgrade (adds an exception)
      --no-prune                 keep every older version this time
  pnpm arena tool remove <family@version>...
  pnpm arena tool prune                     remove versions past each family's keep count
  pnpm arena families                       linter families and platforms

  pnpm arena rules list                     the shared rule set, under each family's name
  pnpm arena rules verify [--linters <ids>] every linter must report each rule in its fixture

  pnpm arena run --target <path> [options]  benchmark a project on this machine
      --linters <ids>      comma-separated family@version list
                           (default: every installed tool)
      --reference <id>     the linter every other is compared with (default: newest installed eslint)
      --exclude <list>     comma-separated paths to leave out, relative to the target
      --rounds <n>         timed rounds, odd (default: 7)
      --threads <list>     default,1,4,max (default: default)
      --label <name>       how the target is named in results (default: its folder name)
      --smoke              one round, written to results/.smoke/
      --no-save            keep nothing: print the report, then delete every record
      --allow-battery      run on battery power
  pnpm arena run --corpus <name> [options]  benchmark a pinned public project

  pnpm arena watch [--write]                new linter versions past the 7-day window (--write adds them)
  pnpm arena corpus setup [name]            clone corpus projects at their pinned commits
  pnpm arena report <run-dir>               regenerate summary.json and report.md
  pnpm arena index                          regenerate results/index.json
  pnpm arena publish <private-run-id> --label <public name>
                                            copy a local run into results/ under a neutral name

Path targets are written to results/private/ (gitignored). Nothing leaves this
machine unless you publish it and push.`;

function reportPruned(added: Tool[], pruned: string[]): void {
  if (pruned.length) console.log(`removed older versions: ${pruned.join(' ')}`);
  for (const t of added) {
    if (pruned.includes(t.id)) console.warn(`${t.id} is older than the versions ${t.family.name} keeps, so it was removed again; add it with --no-prune to keep it`);
  }
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** The newest installed ESLint: the default reference. */
function newestEslint(): string | undefined {
  return listTools()
    .filter(t => t.family.name === 'eslint' && binaryPath(t))
    .sort((a, b) => compareVersions(a.version, b.version))
    .map(t => t.id)
    .at(-1);
}

/** The newest installed version of every family, for commands that need one each. */
function newestPerFamily(): Tool[] {
  const installed = listTools().filter(t => availableOn(t) && binaryPath(t));
  return families.flatMap(f => installed.filter(t => t.family.name === f.name).sort((a, b) => compareVersions(a.version, b.version)).slice(-1));
}

function parseThreads(list: string): ThreadSetting[] {
  return list.split(',').map(s => {
    if (s === 'default') return 'default';
    if (s === 'max') return cpus().length;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 1) fail(`--threads: "${s}" is not default, max or a positive integer`);
    return n;
  });
}

async function main(): Promise<void> {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return;

    case 'families':
      for (const f of families) {
        console.log(`${f.name.padEnd(8)} ${f.package.padEnd(16)} ${f.versions.padEnd(6)} ${f.description}`);
        console.log(`${''.padEnd(8)} platforms: ${Object.keys(f.binary).join(', ')}; threads: ${f.threads ? f.threads.n.join(' ') : 'none documented'}`);
      }
      return;

    case 'tool': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { 'allow-young': { type: 'boolean' }, 'allow-trust-downgrade': { type: 'boolean' }, 'no-install': { type: 'boolean' }, 'no-prune': { type: 'boolean' } } });
      if (sub === 'list') {
        for (const t of listTools()) {
          const status = !availableOn(t) ? `no build for ${PLATFORM}` : binaryPath(t) ? 'installed' : 'not installed (pnpm install)';
          console.log(`${t.id.padEnd(24)} ${status}`);
        }
        return;
      }
      if (sub === 'prune') {
        const pruned = pruneTools();
        console.log(pruned.length ? `removed ${pruned.join(' ')}` : 'nothing past the keep count');
        if (pruned.length && !values['no-install']) pnpmInstall();
        return;
      }
      if (positionals.length === 0) fail(`tool ${sub ?? ''}: give at least one family@version`);
      if (sub === 'add') {
        const { added, pruned } = addTools(positionals, {
          allowYoung: values['allow-young'],
          allowTrustDowngrade: values['allow-trust-downgrade'],
          install: !values['no-install'],
          prune: !values['no-prune'],
        });
        reportPruned(added, pruned);
        return;
      }
      if (sub === 'remove') {
        removeTools(positionals, { install: !values['no-install'] });
        return;
      }
      fail(`unknown tool command "${sub}"`);
    }

    case 'rules': {
      if (sub === 'list') {
        console.log(`${'rule'.padEnd(28)} ${'eslint'.padEnd(40)} ${'biome'.padEnd(42)} oxlint, deno`);
        for (const r of rules) console.log(`${r.id.padEnd(28)} ${r.eslint.padEnd(40)} ${r.biome.padEnd(42)} ${r.oxlint === r.id && r.deno === r.id ? 'same' : `${r.oxlint}, ${r.deno}`}`);
        console.log(`${rules.length} rules`);
        return;
      }
      if (sub === 'verify') {
        const { values } = parseArgs({ args: rest, options: { linters: { type: 'string' } } });
        const tools = values.linters ? values.linters.split(',').filter(Boolean).map(parseTool) : newestPerFamily();
        if (tools.length === 0) fail('no linters installed; run pnpm install');
        let bad = 0;
        for (const r of verifyRules(tools)) {
          const ok = r.missed.length === 0 && r.files === r.expected && !r.error;
          if (!ok) bad++;
          console.log(`${r.tool.padEnd(22)} ${ok ? 'ok' : 'FAIL'}  ${r.files ?? '?'} of ${r.expected} fixtures linted${r.missed.length ? `; missed: ${r.missed.join(', ')}` : ''}${r.error ? `\n  ${r.error}` : ''}`);
        }
        if (bad) process.exit(1);
        return;
      }
      fail('rules: list or verify');
    }

    case 'run': {
      const { values } = parseArgs({
        args: [sub, ...rest].filter((a): a is string => a !== undefined),
        options: {
          target: { type: 'string' },
          corpus: { type: 'string' },
          linters: { type: 'string' },
          reference: { type: 'string' },
          exclude: { type: 'string' },
          rounds: { type: 'string' },
          threads: { type: 'string' },
          label: { type: 'string' },
          smoke: { type: 'boolean' },
          'no-save': { type: 'boolean' },
          'allow-battery': { type: 'boolean' },
        },
      });
      let target: string;
      let exclude = values.exclude?.split(',').filter(Boolean) ?? [];
      let label = values.label;
      if (values.corpus) {
        const project = corpusProject(values.corpus);
        target = join(CORPUS_DIR, project.name);
        if (!existsSync(target)) fail(`corpus project ${project.name} is not set up; run pnpm arena corpus setup ${project.name}`);
        exclude = [...project.exclude, ...exclude];
        label ??= project.name;
      } else if (values.target) {
        target = isAbsolute(values.target) ? values.target : resolve(process.cwd(), values.target);
        if (!existsSync(target)) fail(`target not found: ${values.target}`);
      } else {
        fail('run: pass --target <path> or --corpus <name>');
      }
      const linters = values.linters?.split(',').filter(Boolean) ?? listTools().filter(t => binaryPath(t)).flatMap(t => [t.id, ...variantIds(t)]);
      const reference = values.reference ?? newestEslint();
      if (!reference) fail('no reference: install an eslint version (pnpm arena tool add eslint@10.15.0) or pass --reference');
      linters.forEach(parseTool);
      await run({
        target,
        label,
        corpus: Boolean(values.corpus),
        linters,
        reference,
        exclude,
        rounds: values.rounds ? Number(values.rounds) : undefined,
        threads: values.threads ? parseThreads(values.threads) : undefined,
        smoke: values.smoke,
        save: !values['no-save'],
        allowBattery: values['allow-battery'],
      });
      if (!values['no-save']) writeIndex();
      return;
    }

    case 'corpus':
      if (sub !== 'setup') fail('corpus: the only command is setup');
      setupCorpus(rest[0]);
      return;

    case 'report': {
      if (!sub) fail('report: give a run directory');
      const summary = writeReport(resolve(process.cwd(), sub));
      console.log(`${summary.id}: summary.json and report.md written`);
      return;
    }

    case 'index':
      console.log(`${writeIndex().length} runs in results/index.json`);
      return;

    case 'publish': {
      const { values } = parseArgs({ args: rest, options: { label: { type: 'string' } } });
      if (!sub || !values.label) fail('publish: pnpm arena publish <private-run-id> --label <public name>');
      const from = join(RESULTS_DIR, 'private', sub);
      if (!existsSync(join(from, 'run.json'))) fail(`no private run ${sub}`);
      const meta = JSON.parse(readFileSync(join(from, 'run.json'), 'utf8')) as { label: string; id: string };
      const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      // The id ends in the label's slug, and a -N suffix for a second run that day.
      const privateTail = new RegExp(`${slug(meta.label)}(-\\d+)?$`);
      if (!privateTail.test(meta.id)) fail(`run id ${meta.id} does not end in its label ${meta.label}`);
      const publicId = meta.id.replace(privateTail, slug(values.label));
      const to = join(RESULTS_DIR, publicId);
      if (existsSync(to)) fail(`results/${publicId} exists`);
      cpSync(from, to, { recursive: true });
      const relabel = scrubber({});
      for (const file of listFiles(to)) {
        writeFileSync(file, relabel(readFileSync(file, 'utf8').replaceAll(meta.id, publicId).replaceAll(meta.label, values.label)));
      }
      writeReport(to);
      writeIndex();
      console.log(`published to ${relative(ROOT, to)}; review it before you commit: parity/ names the project's file paths`);
      return;
    }

    case 'install':
      pnpmInstall();
      return;

    case 'watch': {
      const found = newVersions();
      console.log(found.length ? found.join('\n') : 'no new versions past the release age window');
      if (sub === '--write' && found.length) {
        const { added, pruned } = addTools(found, { install: false });
        reportPruned(added, pruned);
      }
      return;
    }

    default:
      fail(`unknown command "${cmd}"; run pnpm arena help`);
  }
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(d => d.isFile())
    .map(d => join(d.parentPath, d.name));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
