// What linters report, reduced to one shape and compared. Covered by
// test/findings.test.ts.
//
// Each family's output becomes a list of findings: file (relative to the target,
// "/" separators), line and column (both 1-based) and the canonical rule id. Two
// lists are compared as multisets at two levels: exact (file, line, column, rule)
// and by line (file, line, rule), since linters anchor some rules at different
// columns (Deno reports eqeqeq where the comparison starts, ESLint at the operator).
// A file that does not parse is one parse-error finding without a position: the
// linters disagree on where a syntax error is, and every one of them stops there.
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FamilyName } from './linters.ts';
import { PARSE_ERROR, canonicalRule } from './rules.ts';

export interface Finding {
  file: string;
  line: number;
  column: number;
  rule: string;
}

export interface ParsedOutput {
  findings: Finding[];
  /** How many files the linter says it linted, or null when its output does not say. */
  files: number | null;
  /** The linted file list, where the output names every file (ESLint does). */
  fileList: string[] | null;
  /**
   * Findings outside the shared rule set, left out of the comparison. ESLint reports
   * one for every disable comment that names a rule its config does not load
   * ("Definition for rule 'n/...' was not found").
   */
  outside: number;
}

/** Leaves out findings outside the shared rule set, and counts them. */
function inSet(parsed: Omit<ParsedOutput, 'outside'>): ParsedOutput {
  const findings = parsed.findings.filter(f => !f.rule.startsWith('other:'));
  return { ...parsed, findings, outside: parsed.findings.length - findings.length };
}

const toRelative = (target: string, file: string): string => {
  const path = file.startsWith('file://') ? fileURLToPath(file) : file;
  return (isAbsolute(path) ? relative(target, path) : path).replaceAll('\\', '/').replace(/^\.\//, '');
};

/** The first JSON value in a text that may carry log lines around it. */
function json<T>(text: string): T {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('no JSON in output');
  return JSON.parse(text.slice(start)) as T;
}

interface EslintFile {
  filePath: string;
  messages: { ruleId: string | null; line?: number; column?: number; fatal?: boolean }[];
}

interface OxlintOutput {
  number_of_files: number;
  diagnostics: { code?: string; filename: string; labels?: { span: { line: number; column: number } }[] }[];
}

interface BiomeOutput {
  summary: { changed: number; unchanged: number };
  diagnostics: { category: string; location?: { path?: string; start?: { line: number; column: number } } }[];
}

// file:///a/b.ts: line 2, col 3 - message (rule)
const DENO_FINDING = /^(file:\/\/\S+): line (\d+), col (\d+) - .* \(([\w-]+)\)$/;
const DENO_PARSE_ERROR = /^Error linting: (.+)$/;
const DENO_CHECKED = /^Checked (\d+) files?$/m;

/**
 * Parses one family's output. Throws when the output is not what the family prints,
 * which the run records as a failure.
 */
export function parseOutput(familyName: FamilyName, stdout: string, stderr: string, target: string): ParsedOutput {
  return inSet(parseRaw(familyName, stdout, stderr, target));
}

function parseRaw(familyName: FamilyName, stdout: string, stderr: string, target: string): Omit<ParsedOutput, 'outside'> {
  switch (familyName) {
    case 'eslint': {
      const files = json<EslintFile[]>(stdout);
      const findings = files.flatMap(f =>
        f.messages.map(m =>
          m.fatal || m.ruleId === null
            ? { file: toRelative(target, f.filePath), line: 0, column: 0, rule: PARSE_ERROR }
            : { file: toRelative(target, f.filePath), line: m.line ?? 0, column: m.column ?? 0, rule: canonicalRule('eslint', m.ruleId) }
        )
      );
      return { findings, files: files.length, fileList: files.map(f => toRelative(target, f.filePath)).sort() };
    }
    case 'oxlint': {
      const out = json<OxlintOutput>(stdout);
      const findings = out.diagnostics.map(d => {
        const span = d.labels?.[0]?.span;
        return d.code
          ? { file: toRelative(target, d.filename), line: span?.line ?? 0, column: span?.column ?? 0, rule: canonicalRule('oxlint', d.code) }
          : { file: toRelative(target, d.filename), line: 0, column: 0, rule: PARSE_ERROR };
      });
      return { findings, files: out.number_of_files, fileList: null };
    }
    case 'biome': {
      const out = json<BiomeOutput>(stdout);
      const findings = out.diagnostics
        .filter(d => d.location?.path)
        .map(d =>
          d.category.startsWith('lint/')
            ? { file: toRelative(target, d.location!.path!), line: d.location!.start?.line ?? 0, column: d.location!.start?.column ?? 0, rule: canonicalRule('biome', d.category) }
            : { file: toRelative(target, d.location!.path!), line: 0, column: 0, rule: PARSE_ERROR }
        );
      return { findings: dedupeParseErrors(findings), files: out.summary.changed + out.summary.unchanged, fileList: null };
    }
    case 'deno': {
      const text = `${stdout}\n${stderr}`;
      const checked = DENO_CHECKED.exec(text);
      if (!checked) throw new Error('no "Checked N files" line in deno lint output');
      const findings: Finding[] = [];
      for (const line of text.split(/\r?\n/)) {
        const m = DENO_FINDING.exec(line);
        if (m) {
          findings.push({ file: toRelative(target, m[1]!.replace(/:$/, '')), line: Number(m[2]), column: Number(m[3]), rule: canonicalRule('deno', m[4]!) });
          continue;
        }
        const p = DENO_PARSE_ERROR.exec(line);
        if (p) findings.push({ file: toRelative(target, p[1]!.trim()), line: 0, column: 0, rule: PARSE_ERROR });
      }
      return { findings, files: Number(checked[1]), fileList: null };
    }
  }
}

/** Biome reports every syntax error in a file; the comparison counts one per file. */
function dedupeParseErrors(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    if (f.rule !== PARSE_ERROR) return true;
    if (seen.has(f.file)) return false;
    seen.add(f.file);
    return true;
  });
}

/** The finding as a line of text: exact (with column) or by line. Parse errors carry no position. */
export function key(f: Finding, level: 'exact' | 'line'): string {
  if (f.rule === PARSE_ERROR) return `${f.file} ${PARSE_ERROR}`;
  return level === 'exact' ? `${f.file}:${f.line}:${f.column} ${f.rule}` : `${f.file}:${f.line} ${f.rule}`;
}

/** Multiset difference: what is in `a` more often than in `b`. */
export function multisetMinus(a: string[], b: string[]): string[] {
  const counts = new Map<string, number>();
  for (const x of b) counts.set(x, (counts.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = counts.get(x) ?? 0;
    if (n > 0) counts.set(x, n - 1);
    else out.push(x);
  }
  return out.sort();
}

export type Parity = 'identical' | 'same-lines' | 'differs' | 'failed';

export interface ParityResult {
  parity: Parity;
  /** Findings this linter reported in the shared rule set. */
  findings: number;
  /** Findings outside the shared rule set, not compared (see ParsedOutput.outside). */
  outside: number;
  /** Files it says it linted, and the arena's count. */
  files: number | null;
  expectedFiles: number;
  /** By-line findings only this linter reported, and only the reference reported. */
  extra: string[];
  missing: string[];
  /** Of extra and missing, those on a line a disable comment covers. */
  nearDirective: { extra: number; missing: number };
  /** Extra and missing per rule. */
  byRule: Record<string, { extra: number; missing: number }>;
  /** Why the output could not be read, for a failed linter. */
  error?: string;
}

/** Whether a finding's line is covered by a disable comment in the source (`lines` is the file, 0-based). */
export type DirectiveCheck = (file: string, line: number, rule: string) => boolean;

export function compareFindings(
  mine: ParsedOutput,
  reference: ParsedOutput,
  expectedFiles: number,
  nearDirective: DirectiveCheck = () => false
): ParityResult {
  const extra = multisetMinus(mine.findings.map(f => key(f, 'line')), reference.findings.map(f => key(f, 'line')));
  const missing = multisetMinus(reference.findings.map(f => key(f, 'line')), mine.findings.map(f => key(f, 'line')));
  const exactExtra = multisetMinus(mine.findings.map(f => key(f, 'exact')), reference.findings.map(f => key(f, 'exact')));
  const exactMissing = multisetMinus(reference.findings.map(f => key(f, 'exact')), mine.findings.map(f => key(f, 'exact')));
  const parity: Parity =
    mine.files !== null && mine.files !== expectedFiles
      ? 'failed'
      : extra.length === 0 && missing.length === 0
        ? exactExtra.length === 0 && exactMissing.length === 0
          ? 'identical'
          : 'same-lines'
        : 'differs';

  const byRule: Record<string, { extra: number; missing: number }> = {};
  const near = { extra: 0, missing: 0 };
  const tally = (lines: string[], side: 'extra' | 'missing') => {
    for (const line of lines) {
      const parsed = parseKey(line);
      byRule[parsed.rule] ??= { extra: 0, missing: 0 };
      byRule[parsed.rule]![side]++;
      if (parsed.rule !== PARSE_ERROR && nearDirective(parsed.file, parsed.line, parsed.rule)) near[side]++;
    }
  };
  tally(extra, 'extra');
  tally(missing, 'missing');
  return {
    parity,
    findings: mine.findings.length,
    outside: mine.outside,
    files: mine.files,
    expectedFiles,
    extra,
    missing,
    nearDirective: near,
    byRule,
    ...(parity === 'failed' ? { error: `linted ${mine.files} files, expected ${expectedFiles}` } : {}),
  };
}

/** The inverse of key(f, 'line'). */
export function parseKey(line: string): { file: string; line: number; rule: string } {
  const space = line.lastIndexOf(' ');
  const rule = line.slice(space + 1);
  const head = line.slice(0, space);
  if (rule === PARSE_ERROR) return { file: head, line: 0, rule };
  const colon = head.lastIndexOf(':');
  return { file: head.slice(0, colon), line: Number(head.slice(colon + 1)), rule };
}

export function failedResult(error: string, expectedFiles: number): ParityResult {
  return { parity: 'failed', findings: 0, outside: 0, files: null, expectedFiles, extra: [], missing: [], nearDirective: { extra: 0, missing: 0 }, byRule: {}, error };
}
