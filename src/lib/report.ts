// Turns a run's raw records (run.json, timing.csv, parity.json) into summary.json,
// which the site reads, and report.md, which people read. Both are regenerated from
// the raw records at any time, so a change to how numbers are computed applies to
// every past run.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type CorpusProject, corpus } from './corpus.ts';
import type { ParityResult } from './findings.ts';
import { RESULTS_DIR } from './paths.ts';
import type { RunMeta } from './run.ts';
import { type Summary, type Timing, speedup, summarize } from './stats.ts';

export interface LinterSummary extends Summary {
  id: string;
  family: string;
  version: string;
  /** Reference median wall time / this linter's. */
  speedup: number;
}

export interface ParitySummary {
  id: string;
  parity: ParityResult['parity'];
  findings: number;
  /** Findings outside the shared rule set, not compared. */
  outside: number;
  files: number | null;
  extra: number;
  missing: number;
  /** Extra and missing on lines a disable comment covers. */
  nearDirective: { extra: number; missing: number };
  /** Share of the reference's by-line findings this linter also reported, 0 to 1. */
  agreement: number;
  /** The rules with the most differences, most first. */
  topRules: { rule: string; extra: number; missing: number }[];
  error?: string;
}

export interface RunSummary {
  schema: 1;
  id: string;
  label: string;
  date: string;
  source: RunMeta['source'];
  machine: RunMeta['machine'];
  reference: string;
  rounds: number;
  files: number;
  rules: number;
  /** The reference's findings, the denominator of agreement. */
  referenceFindings: number;
  settings: { threads: string; linters: LinterSummary[] }[];
  parity: ParitySummary[];
  unavailable: string[];
  /** Linters that failed and were therefore not timed. */
  untimed: string[];
  /** The public project linted, for corpus runs at a clean, recorded commit. */
  project?: { repo: string; commit: string; description: string };
}

export function projectOf(meta: Pick<RunMeta, 'label' | 'target'>, projects: CorpusProject[] = corpus): RunSummary['project'] {
  if (meta.target.kind !== 'corpus' || !meta.target.commit || meta.target.dirty) return undefined;
  const p = projects.find(x => x.name === meta.label);
  return p ? { repo: p.repo, commit: meta.target.commit, description: p.description } : undefined;
}

interface Row {
  threads: string;
  round: number;
  warm: boolean;
  linter: string;
  timing: Timing;
}

export function readTiming(csv: string): Row[] {
  return csv
    .trim()
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map(line => {
      const [threads, round, warm, linter, real, user, sys, maxrss] = line.split(',');
      return {
        threads: threads!,
        round: Number(round),
        warm: warm === 'true',
        linter: linter!,
        timing: { real: Number(real), user: Number(user), sys: Number(sys), maxrss: Number(maxrss) },
      };
    });
}

export function summarizeRun(meta: RunMeta, rows: Row[], parity: Record<string, ParityResult>): RunSummary {
  const settings = [...new Set(rows.map(r => r.threads))].map(threads => {
    const inSetting = rows.filter(r => r.threads === threads && !r.warm);
    const ids = [...new Set(inSetting.map(r => r.linter))];
    const summaries = ids.map(id => {
      const linter = meta.linters.find(l => l.id === id)!;
      return { id, family: linter.family, version: linter.version, ...summarize(inSetting.filter(r => r.linter === id).map(r => r.timing)), speedup: 0 };
    });
    const ref = summaries.find(s => s.id === meta.reference);
    for (const s of summaries) s.speedup = ref ? speedup(ref.median, s.median) : Number.NaN;
    return { threads, linters: summaries.sort((a, b) => a.median - b.median) };
  });

  const referenceFindings = parity[meta.reference]?.findings ?? 0;
  const paritySummaries: ParitySummary[] = Object.entries(parity).map(([id, r]) => ({
    id,
    parity: r.parity,
    findings: r.findings,
    outside: r.outside ?? 0,
    files: r.files,
    extra: r.extra.length,
    missing: r.missing.length,
    nearDirective: r.nearDirective,
    agreement: referenceFindings === 0 ? (r.extra.length === 0 ? 1 : 0) : r.parity === 'failed' ? 0 : (referenceFindings - r.missing.length) / referenceFindings,
    topRules: Object.entries(r.byRule)
      .map(([rule, c]) => ({ rule, ...c }))
      .sort((a, b) => b.extra + b.missing - (a.extra + a.missing) || a.rule.localeCompare(b.rule))
      .slice(0, 8),
    ...(r.error ? { error: r.error } : {}),
  }));

  return {
    schema: 1,
    id: meta.id,
    label: meta.label,
    date: meta.startedAt,
    source: meta.source,
    machine: meta.machine,
    reference: meta.reference,
    rounds: meta.rounds,
    files: meta.files.linted,
    rules: meta.rules.length,
    referenceFindings,
    settings,
    parity: paritySummaries,
    unavailable: meta.linters.filter(l => !l.available).map(l => l.id),
    untimed: paritySummaries.filter(p => p.parity === 'failed').map(p => p.id),
    project: projectOf(meta),
  };
}

const s3 = (n: number) => (n < 1 ? n.toFixed(3) : n.toFixed(2));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function renderMarkdown(meta: RunMeta, summary: RunSummary): string {
  const lines: string[] = [];
  const where =
    meta.source.kind === 'ci' ? `CI runner \`${meta.source.runner}\`` : meta.source.kind === 'act' ? `act on this machine, as \`${meta.source.runner}\`` : 'local machine';
  const minutes = Math.round((Date.parse(meta.endedAt) - Date.parse(meta.startedAt)) / 60000);
  const main = summary.settings.find(s => s.threads === 'default') ?? summary.settings[0];
  const fastest = main?.linters[0];
  const identical = summary.parity.filter(p => p.id !== meta.reference && (p.parity === 'identical' || p.parity === 'same-lines')).length;

  lines.push(`# ${meta.label}`, '');
  if (fastest) {
    const lead = fastest.id === meta.reference ? 'is the fastest linter' : `is **${fastest.speedup.toFixed(1)}×** faster than \`${meta.reference}\``;
    lines.push(`> **\`${fastest.id}\`** ${lead}: ${s3(fastest.median)} s to lint ${summary.files} files with ${summary.rules} shared rules. ${identical} of ${summary.parity.length - 1} other linters report exactly the reference's findings.`, '');
  }
  lines.push('| | |', '|---|---|');
  lines.push(`| **Machine** | ${meta.machine.cpu}, ${meta.machine.cores} cores, ${meta.machine.memoryGiB} GiB |`);
  lines.push(`| **System** | ${meta.machine.os}, Node ${meta.machine.node}, ${where} |`);
  lines.push(`| **When** | ${meta.startedAt.slice(0, 16).replace('T', ' ')} UTC, ${minutes} min |`);
  lines.push(`| **Method** | median of ${meta.rounds} rounds after one warm-up; linter order rotated every round |`);
  lines.push(`| **Files** | ${summary.files} linted; ${meta.files.excludedDirs} folders and ${meta.files.excludedFiles} files skipped |`);
  lines.push(`| **Rules** | ${summary.rules} shared rules (rules.json) |`);
  lines.push(`| **Reference** | \`${meta.reference}\`, ${summary.referenceFindings} findings |`);
  lines.push(`| **Run** | \`${meta.id}\` |`, '');
  if (summary.unavailable.length) lines.push(`No build for ${meta.machine.platform}: ${summary.unavailable.map(i => `\`${i}\``).join(', ')}.`, '');
  if (summary.untimed.length) lines.push(`**Not timed**, because they failed (see Findings and \`parity/\`): ${summary.untimed.map(i => `\`${i}\``).join(', ')}.`, '');

  for (const setting of summary.settings) {
    lines.push(`## ${setting.threads === 'default' ? 'Speed, as shipped' : `Speed, ${setting.threads} ${setting.threads === '1' ? 'thread' : 'threads'}`}`, '');
    lines.push('One lint of the whole file set per round. CPU is user plus sys time over all threads; peak is the largest resident set.', '');
    lines.push('| Linter | Wall | Range | vs reference | CPU | Peak |', '|---|--:|--:|--:|--:|--:|');
    for (const l of setting.linters) {
      lines.push(`| \`${l.id}\` | **${s3(l.median)} s** | ${s3(l.min)} to ${s3(l.max)} | ${l.speedup.toFixed(1)}× | ${s3(l.cpu)} s | ${Math.round(l.rssMiB)} MiB |`);
    }
    lines.push('');
  }

  lines.push('## Findings', '', `Each linter's findings, compared with \`${meta.reference}\` by file, line and rule.`, '');
  lines.push('| Linter | Result | Findings | Files | Agreement | Extra | Missing | Near a directive |', '|---|---|--:|--:|--:|--:|--:|--:|');
  for (const p of summary.parity) {
    const result = p.parity === 'failed' ? '❌ failed' : p.parity === 'differs' ? '⚠️ differs' : p.parity === 'same-lines' ? '✅ same lines' : '✅ identical';
    lines.push(`| \`${p.id}\` | ${result} | ${p.findings} | ${p.files ?? ''} | ${pct(p.agreement)} | ${p.extra} | ${p.missing} | ${p.nearDirective.extra} extra, ${p.nearDirective.missing} missing |`);
  }
  lines.push('', 'Agreement: the share of the reference\'s findings this linter also reported. Extra: findings only that linter reported. Missing: findings only the reference reported. Near a directive: differences on lines an `eslint-disable`, `oxlint-disable`, `biome-ignore` or `deno-lint-ignore` comment covers; each linter honors only its own. Same lines: every finding matches by line, some at another column. The full lists are in parity/.', '');

  const differing = summary.parity.filter(p => p.topRules.length);
  if (differing.length) {
    lines.push('## Where they differ', '', 'The rules with the most differences per linter.', '', '| Linter | Rule | Extra | Missing |', '|---|---|--:|--:|');
    for (const p of differing) for (const r of p.topRules) lines.push(`| \`${p.id}\` | \`${r.rule}\` | ${r.extra} | ${r.missing} |`);
    lines.push('');
  }
  for (const p of summary.parity.filter(x => x.error)) lines.push(`- \`${p.id}\`: ${p.error}`);
  if (summary.parity.some(x => x.error)) lines.push('');

  lines.push('## Linters', '', '| Linter | Package | Default threads | Version output | Binary sha256 |', '|---|---|---|---|---|');
  for (const l of meta.linters) {
    const companions = Object.entries(l.with ?? {}).map(([p, v]) => `, ${p}@${v}`).join('');
    lines.push(`| ${l.id} | ${l.package}@${l.version}${companions} | ${l.defaultThreads ?? ''} | ${l.available ? (l.versionOutput ?? '') : 'no build'} | ${l.binarySha256?.slice(0, 16) ?? ''} |`);
  }
  if (meta.conditions.warnings.length) lines.push('', '## Conditions', '', ...meta.conditions.warnings.map(w => `- ${w}`));
  return `${lines.join('\n')}\n`;
}

export function writeReport(dir: string): RunSummary {
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as RunMeta;
  const rows = readTiming(readFileSync(join(dir, 'timing.csv'), 'utf8'));
  const parity = JSON.parse(readFileSync(join(dir, 'parity.json'), 'utf8')) as Record<string, ParityResult>;
  const summary = summarizeRun(meta, rows, parity);
  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, 'report.md'), renderMarkdown(meta, summary));
  return summary;
}

/** Every published run (results/<id>/), newest first, for the site. */
export function writeIndex(root = RESULTS_DIR): string[] {
  const runs = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'private' && existsSync(join(root, d.name, 'summary.json')))
        .map(d => d.name)
        .sort()
        .reverse()
    : [];
  writeFileSync(join(root, 'index.json'), `${JSON.stringify({ runs }, null, 2)}\n`);
  return runs.map(r => relative(root, join(root, r)));
}
