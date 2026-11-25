// Timing one process, the same way on every run of an OS:
//
//   macOS    /usr/bin/time -l: rusage of the process and its waited-for children;
//            peak memory is the maximum resident set size; wall time from a
//            nanosecond clock around it
//   Linux    GNU time (/usr/bin/time -f): the same rusage fields and wall clock
//   Windows  windows-time.ps1: wall time from a stopwatch, CPU times and peak working
//            set of the process (not its children) from its process handle
//
// The linter's output is discarded; output is captured separately, untimed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Measured, parseGnuTime, parseMacTime } from './stats.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Wall seconds since `start`. /usr/bin/time prints wall time in hundredths, too
 * coarse for checks that take a few milliseconds, so wall time is taken around the
 * timer's own process instead; the timer's start-up is the same for every linter.
 */
const elapsed = (start: bigint): number => Number(process.hrtime.bigint() - start) / 1e9;

export function measure(argv: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Measured {
  const [file, ...args] = argv;
  if (!file) throw new Error('measure: empty command');
  if (process.platform === 'darwin') {
    const start = process.hrtime.bigint();
    const r = spawnSync('/usr/bin/time', ['-l', file, ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 30 });
    const real = elapsed(start);
    if (r.error) throw r.error;
    return { ...parseMacTime(r.stderr), real, exit: r.status ?? -1 };
  }
  const dir = mkdtempSync(join(tmpdir(), 'arena-time-'));
  const out = join(dir, 'time.txt');
  try {
    if (process.platform === 'linux') {
      const start = process.hrtime.bigint();
      const r = spawnSync('/usr/bin/time', ['-f', '%e %U %S %M %x', '-o', out, file, ...args], { cwd, env, stdio: 'ignore' });
      const real = elapsed(start);
      if (r.error) throw r.error;
      return { ...parseGnuTime(readFileSync(out, 'utf8')), real };
    }
    if (process.platform === 'win32') {
      const spec = join(dir, 'spec.json');
      writeFileSync(spec, JSON.stringify({ file, args, cwd, env, out }));
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'windows-time.ps1'), spec], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`windows-time.ps1 failed: ${r.stderr}`);
      const [real, user, sys, maxrss, exit] = readFileSync(out, 'utf8').trim().split(' ').map(Number);
      return { real: real!, user: user!, sys: sys!, maxrss: maxrss!, exit: exit! };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  throw new Error(`timing is not supported on ${process.platform}`);
}

/** What measure() needs that is missing on this machine; each entry blocks a run. */
export function timingPrerequisites(): string[] {
  if (process.platform === 'darwin') return existsSync('/usr/bin/time') ? [] : ['/usr/bin/time not found'];
  if (process.platform === 'linux') {
    const r = spawnSync('/usr/bin/time', ['--version'], { encoding: 'utf8' });
    return r.status === 0 && /GNU/.test(r.stdout + r.stderr) ? [] : ['GNU time is required at /usr/bin/time (Debian and Ubuntu: apt install time)'];
  }
  if (process.platform === 'win32') {
    return spawnSync('powershell', ['-NoProfile', '-Command', 'exit 0']).status === 0 ? [] : ['PowerShell is required'];
  }
  return [`timing is not supported on ${process.platform}`];
}

export interface Captured {
  stdout: string;
  stderr: string;
  exit: number;
}

/**
 * Runs a command untimed and returns its output and exit code. The streams stay
 * apart: linters print JSON on stdout and notices (Biome's experimental reporter,
 * ESLint's warnings) on stderr.
 */
export function capture(argv: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Captured {
  const [file, ...args] = argv;
  const r = spawnSync(file!, args, { cwd, env, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.error) return { stdout: '', stderr: String(r.error), exit: -1 };
  return { stdout: r.stdout, stderr: r.stderr, exit: r.status ?? -1 };
}
