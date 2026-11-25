// One benchmark run into results/<id>/. docs/METHOD.md describes every step; this
// file is the only place they are carried out.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { directiveCheck } from './directives.ts';
import { type FileSet, computeFileSet } from './fileset.ts';
import { type ParityResult, type ParsedOutput, compareFindings, failedResult, parseOutput } from './findings.ts';
import { type ThreadSetting, type Tool, availableOn, binaryPath, command, freshDirs, installedVersion, parseTool, threadArgs } from './linters.ts';
import { type Machine, type Source, cpuModel, holdAwake, machine, onAC, source, underRosetta, warnings } from './machine.ts';
import { type Captured, capture, measure, timingPrerequisites } from './measure.ts';
import { PLATFORM, RESULTS_DIR, ROOT } from './paths.ts';
import { writeReport } from './report.ts';
import { type LintConfig, prepareConfigDir, removeConfigDir, rules, writeConfig } from './rules.ts';
import { type Scrubber, scrubber } from './scrub.ts';
import { type Measured, rotate } from './stats.ts';
import { targetRevision } from './targets.ts';

export interface RunOptions {
  target: string;
  label?: string;
  /** Whether the target is a public corpus project; path targets stay in results/private/. */
  corpus?: boolean;
  linters: string[];
  reference: string;
  /** Paths left out of the file set, relative to the target. */
  exclude?: string[];
  rounds?: number;
  threads?: ThreadSetting[];
  allowBattery?: boolean;
  smoke?: boolean;
  /** false: nothing is kept; the report is printed and the records are deleted. */
  save?: boolean;
  log?: (line: string) => void;
}

export interface LinterMeta {
  id: string;
  family: string;
  package: string;
  version: string;
  /** Companion packages and their versions (ESLint's TypeScript parser and plugin). */
  with: Record<string, string>;
  variant: string | null;
  variantArgs: string[];
  defaultThreads: number | 'per-core' | null;
  available: boolean;
  versionOutput: string | null;
  binarySha256: string | null;
}

export interface RunMeta {
  schema: 1;
  id: string;
  label: string;
  startedAt: string;
  endedAt: string;
  source: Source;
  machine: Machine;
  target: { kind: 'corpus' | 'path'; commit: string | null; dirty: boolean | null };
  reference: string;
  rounds: number;
  threads: ThreadSetting[];
  linters: LinterMeta[];
  rules: string[];
  files: { linted: number; excludedDirs: number; excludedFiles: number; exclude: string[] };
  conditions: { warnings: string[]; loadStart: number[]; loadEnd: number[] };
}

export interface TimingRow {
  threads: ThreadSetting;
  round: number;
  warm: boolean;
  linter: string;
  m: Measured;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * A run's id and folder name: `2026-11-26-1300-apple-m4-max-darwin-vite`. The UTC
 * start time keeps two runs of one day on one runner apart, and an act run says so,
 * so it can never take the id of the CI run it imitates.
 */
export function runId(parts: { now: Date; cpu: string; platform: string; act: boolean; label: string; smoke: boolean }): string {
  const iso = parts.now.toISOString();
  if (parts.smoke) return `${iso.slice(0, 19).replaceAll(':', '')}-${slug(parts.label)}`;
  const time = iso.slice(11, 16).replace(':', '');
  return `${iso.slice(0, 10)}-${time}-${slug(parts.cpu)}-${parts.platform}${parts.act ? '-act' : ''}-${slug(parts.label)}`;
}

const newRunId = (label: string, smoke: boolean): string =>
  runId({ now: new Date(), cpu: cpuModel(), platform: process.platform, act: source().kind === 'act', label, smoke });

function uniqueDir(base: string): string {
  let dir = base;
  for (let i = 2; existsSync(dir); i++) dir = `${base}-${i}`;
  return dir;
}

function versionOutput(tool: Tool): string | null {
  const bin = binaryPath(tool);
  if (!bin) return null;
  const argv = tool.family.runtime === 'node' ? [process.execPath, bin, '--version'] : [bin, '--version'];
  const out = capture(argv, ROOT);
  return `${out.stdout}${out.stderr}`.trim().split('\n')[0] ?? null;
}

/** Runs one invocation untimed, then deletes its {fresh} folders. */
function lintOnce(tool: Tool, config: LintConfig, target: string): Captured {
  const inv = command(tool, config, '.')!;
  try {
    return capture(inv.argv, target, inv.env);
  } finally {
    for (const d of freshDirs(tool, inv.env)) rmSync(d, { recursive: true, force: true });
  }
}

/** Linters exit 0 when clean and 1 with findings; anything else is a crash, a kill or a refused config. */
const exitedNormally = (exit: number) => exit === 0 || exit === 1;

export async function run(input: RunOptions): Promise<string | null> {
  // Linters print resolved paths (macOS's /tmp is /private/tmp), so the target is too.
  const options = { ...input, target: realpathSync(input.target) };
  const log = options.log ?? (line => console.log(line));
  const label = options.label ?? basename(options.target);
  const smoke = Boolean(options.smoke);
  const rounds = options.rounds ?? (smoke ? 1 : 7);
  if (!smoke && rounds % 2 === 0) throw new Error('--rounds must be odd, so every median is a measured run');
  const threads = options.threads ?? ['default'];

  const ids = [...new Set([options.reference, ...options.linters])];
  const tools = ids.map(parseTool);
  const reference = tools[0]!;
  const runnable = tools.filter(t => availableOn(t));
  for (const t of runnable) {
    if (!binaryPath(t)) throw new Error(`${t.id} is not installed; run pnpm arena tool add ${t.id}`);
  }
  if (!availableOn(reference)) throw new Error(`the reference ${reference.id} has no build for ${PLATFORM}`);

  const blockers = [...timingPrerequisites()];
  if (underRosetta()) blockers.push('node runs under Rosetta; use an arm64 node');
  if (!options.allowBattery && !onAC()) blockers.push('on battery power; connect power or pass --allow-battery');
  if (blockers.length) throw new Error(`refusing to run:\n  ${blockers.join('\n  ')}`);

  const save = options.save !== false;
  const dir = save
    ? uniqueDir(join(RESULTS_DIR, smoke ? '.smoke' : options.corpus ? '' : 'private', newRunId(label, smoke)))
    : join(mkdtempSync(join(os.tmpdir(), 'lint-arena-run-')), newRunId(label, smoke));
  const id = basename(dir);
  mkdirSync(dir, { recursive: true });
  const scrub: Scrubber = scrubber({ '<target>': options.target, '<arena>': ROOT });

  const startedAt = new Date().toISOString();
  const loadStart = os.loadavg();
  const conditionWarnings = [...warnings()];
  const release = holdAwake();

  try {
    // The file set, decided once, and one config per linter that lints exactly it.
    const set: FileSet = computeFileSet(options.target, options.exclude ?? []);
    if (set.files.length === 0) throw new Error('the target has no files to lint');
    prepareConfigDir(options.target);
    const configs = new Map(runnable.map(t => [t.id, writeConfig(options.target, t, set)]));
    log(`${label}: ${set.files.length} files, ${rules.length} rules; reference ${reference.id}; linters ${runnable.map(t => t.id).join(', ')}`);

    // Gate: the reference must run normally, print what it always prints and lint
    // exactly the file set. Every other linter is compared with what it reports.
    const refOut = lintOnce(reference, configs.get(reference.id)!, options.target);
    if (!exitedNormally(refOut.exit)) throw new Error(`the reference ${reference.id} exited ${refOut.exit}: ${scrub(`${refOut.stdout}${refOut.stderr}`.slice(-600))}`);
    const refParsed = parseOutput(reference.family.name, refOut.stdout, refOut.stderr, options.target);
    if (refParsed.fileList) {
      const expected = new Set(set.files);
      const missingFiles = set.files.filter(f => !refParsed.fileList!.includes(f));
      const extraFiles = refParsed.fileList.filter(f => !expected.has(f));
      if (missingFiles.length || extraFiles.length) {
        throw new Error(`the reference linted another file set: ${missingFiles.length} files missing (${missingFiles.slice(0, 3).join(', ')}), ${extraFiles.length} extra (${extraFiles.slice(0, 3).join(', ')})`);
      }
    } else if (refParsed.files !== set.files.length) {
      throw new Error(`the reference linted ${refParsed.files} files, the file set has ${set.files.length}`);
    }
    log(`gate: ${reference.id} reports ${refParsed.findings.length} findings in ${set.files.length} files`);

    // Findings: every linter once, compared with the reference.
    const near = directiveCheck(options.target);
    const exits = new Map<string, number>([[reference.id, refOut.exit]]);
    const parity: Record<string, ParityResult> = {};
    for (const t of runnable) {
      let out: Captured = refOut;
      let parsed: ParsedOutput = refParsed;
      let result: ParityResult;
      if (t !== reference) out = lintOnce(t, configs.get(t.id)!, options.target);
      exits.set(t.id, out.exit);
      if (!exitedNormally(out.exit)) {
        result = failedResult(`exited ${out.exit}`, set.files.length);
      } else {
        try {
          if (t !== reference) parsed = parseOutput(t.family.name, out.stdout, out.stderr, options.target);
          result = compareFindings(parsed, refParsed, set.files.length, near);
        } catch (error) {
          result = failedResult(`unreadable output: ${(error as Error).message}`, set.files.length);
        }
      }
      parity[t.id] = { ...result, extra: result.extra.map(scrub), missing: result.missing.map(scrub), ...(result.error ? { error: scrub(result.error) } : {}) };
      if (result.parity !== 'identical') {
        mkdirSync(join(dir, 'parity'), { recursive: true });
        const body = result.parity === 'failed'
          ? `${result.error}\n\n${out.stdout.slice(-20000)}\n${out.stderr.slice(-20000)}`
          : [`# extra: by-line findings only ${t.id} reported`, ...result.extra, '', `# missing: by-line findings only ${reference.id} reported`, ...result.missing].join('\n');
        writeFileSync(join(dir, 'parity', `${t.id}.txt`), `${scrub(body)}\n`);
      }
      log(`  ${t.id.padEnd(22)} ${result.parity.padEnd(10)} ${result.findings} findings, ${result.extra.length} extra, ${result.missing.length} missing`);
    }

    // A linter that failed (crashed, printed something unreadable or linted another
    // file set) is not timed: a fast failure is not a fast lint.
    const timed = runnable.filter(t => parity[t.id]!.parity !== 'failed');
    for (const t of runnable.filter(t => !timed.includes(t))) log(`  ${t.id}: ${parity[t.id]!.error}, not timed (see parity/)`);

    // Timing: a warm-up round, then `rounds` rounds per thread setting, each one
    // starting one linter further along than the round before.
    const rows: TimingRow[] = [];
    for (const setting of threads) {
      const lane = timed.filter(t => threadArgs(t, setting) !== null);
      for (let round = 0; round <= rounds; round++) {
        const warm = round === 0;
        if (!options.allowBattery && !onAC()) throw new Error('power was disconnected during the run');
        for (const t of rotate(lane, round % lane.length)) {
          const inv = command(t, configs.get(t.id)!, '.', setting)!;
          let m: Measured;
          try {
            m = measure(inv.argv, options.target, inv.env);
          } finally {
            for (const d of freshDirs(t, inv.env)) rmSync(d, { recursive: true, force: true });
          }
          if (setting === 'default' && m.exit !== exits.get(t.id)) throw new Error(`${t.id} exited ${m.exit} while timed, ${exits.get(t.id)} when its output was recorded`);
          rows.push({ threads: setting, round, warm, linter: t.id, m });
          log(`  threads=${setting} ${warm ? 'warm-up' : `round ${round}/${rounds}`} ${t.id.padEnd(22)} ${m.real.toFixed(3)}s`);
        }
      }
    }

    const meta: RunMeta = {
      schema: 1,
      id,
      label,
      startedAt,
      endedAt: new Date().toISOString(),
      source: source(),
      machine: machine(),
      target: { kind: options.corpus ? 'corpus' : 'path', ...targetRevision(options.target) },
      reference: reference.id,
      rounds,
      threads,
      linters: tools.map(t => {
        const bin = availableOn(t) ? binaryPath(t) : null;
        return {
          id: t.id,
          family: t.family.name,
          package: t.family.package,
          version: installedVersion(t) ?? t.version,
          with: t.family.with ?? {},
          variant: t.variant ?? null,
          variantArgs: t.variant ? t.family.variants![t.variant]!.args : [],
          defaultThreads: t.variant ? null : t.family.defaultThreads,
          available: availableOn(t),
          versionOutput: bin ? scrub(versionOutput(t) ?? '') : null,
          binarySha256: bin ? sha256(bin) : null,
        };
      }),
      rules: rules.map(r => r.id),
      files: { linted: set.files.length, excludedDirs: set.excludeDirs.length, excludedFiles: set.excludeFiles.length, exclude: options.exclude ?? [] },
      conditions: { warnings: conditionWarnings.map(scrub), loadStart, loadEnd: os.loadavg() },
    };

    writeFileSync(join(dir, 'run.json'), `${JSON.stringify(meta, null, 2)}\n`);
    writeFileSync(
      join(dir, 'timing.csv'),
      ['threads,round,warm,linter,real,user,sys,maxrss,exit', ...rows.map(r => [r.threads, r.round, r.warm, r.linter, r.m.real, r.m.user, r.m.sys, r.m.maxrss, r.m.exit].join(','))].join('\n') + '\n'
    );
    writeFileSync(join(dir, 'parity.json'), `${JSON.stringify(parity, null, 2)}\n`);
    writeReport(dir);
    if (!save) {
      log('');
      log(readFileSync(join(dir, 'report.md'), 'utf8'));
      log('not saved (--no-save): the records above were deleted with their temporary folder');
      return null;
    }
    log(`results: ${relative(ROOT, dir)}`);
    return dir;
  } finally {
    removeConfigDir(options.target);
    if (!save) rmSync(dirname(dir), { recursive: true, force: true });
    release();
  }
}
