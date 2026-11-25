import { describe, expect, it } from 'vitest';
import { compareFindings, key, multisetMinus, parseKey, parseOutput } from '../src/lib/findings.ts';

const T = '/work/app';

// Real output shapes, trimmed: what each family prints for a debugger statement on
// line 2, an == on line 3 and a file that does not parse.
const ESLINT = JSON.stringify([
  { filePath: `${T}/x.ts`, messages: [{ ruleId: 'no-debugger', line: 2, column: 3 }, { ruleId: 'eqeqeq', line: 3, column: 20 }] },
  { filePath: `${T}/y.ts`, messages: [] },
  { filePath: `${T}/z.ts`, messages: [{ ruleId: null, line: 1, column: 15, fatal: true }] },
  { filePath: `${T}/w.ts`, messages: [{ ruleId: 'n/prefer-node-protocol', line: 1, column: 1 }] },
]);
const OXLINT = JSON.stringify({
  number_of_files: 4,
  diagnostics: [
    { filename: 'z.ts', labels: [{ span: { line: 1, column: 16 } }] },
    { code: 'eslint(no-debugger)', filename: 'x.ts', labels: [{ span: { line: 2, column: 3 } }] },
    { code: 'eslint(eqeqeq)', filename: 'x.ts', labels: [{ span: { line: 3, column: 20 } }] },
  ],
});
const BIOME = JSON.stringify({
  summary: { changed: 0, unchanged: 4 },
  diagnostics: [
    { category: 'lint/suspicious/noDebugger', location: { path: 'x.ts', start: { line: 2, column: 3 } } },
    { category: 'lint/suspicious/noDoubleEquals', location: { path: 'x.ts', start: { line: 3, column: 20 } } },
    { category: 'parse', location: { path: 'z.ts', start: { line: 1, column: 16 } } },
    { category: 'parse', location: { path: 'z.ts', start: { line: 1, column: 17 } } },
  ],
});
const DENO = [
  `Error linting: ${T}/z.ts`,
  '   SyntaxError: Expression expected',
  `file://${T}/x.ts: line 2, col 3 - \`debugger\` statement is not allowed (no-debugger)`,
  `file://${T}/x.ts: line 3, col 18 - expected '===' and instead saw '=='. (eqeqeq)`,
  'Found 2 problems',
  'Checked 4 files',
].join('\n');

describe('parseOutput', () => {
  it('reads ESLint, maps parse errors and leaves out rules outside the set', () => {
    const p = parseOutput('eslint', ESLINT, '', T);
    expect(p.findings.map(f => key(f, 'exact'))).toEqual(['x.ts:2:3 no-debugger', 'x.ts:3:20 eqeqeq', 'z.ts parse-error']);
    expect(p.files).toBe(4);
    expect(p.fileList).toEqual(['w.ts', 'x.ts', 'y.ts', 'z.ts']);
    expect(p.outside).toBe(1);
  });

  it('reads oxlint, whose rule codes carry their plugin', () => {
    const p = parseOutput('oxlint', OXLINT, '', T);
    expect(p.findings.map(f => key(f, 'exact')).sort()).toEqual(['x.ts:2:3 no-debugger', 'x.ts:3:20 eqeqeq', 'z.ts parse-error']);
    expect(p.files).toBe(4);
  });

  it('reads Biome, maps its rule names back and counts one parse error per file', () => {
    const p = parseOutput('biome', `notice before the JSON\n${BIOME}`, '', T);
    expect(p.findings.map(f => key(f, 'exact'))).toEqual(['x.ts:2:3 no-debugger', 'x.ts:3:20 eqeqeq', 'z.ts parse-error']);
    expect(p.files).toBe(4);
  });

  it('reads Deno\'s compact output and its file count', () => {
    const p = parseOutput('deno', '', DENO, T);
    expect(p.findings.map(f => key(f, 'exact'))).toEqual(['z.ts parse-error', 'x.ts:2:3 no-debugger', 'x.ts:3:18 eqeqeq']);
    expect(p.files).toBe(4);
  });

  it('refuses output that is not what the family prints', () => {
    expect(() => parseOutput('oxlint', 'Failed to parse oxlint configuration file.', '', T)).toThrow();
    expect(() => parseOutput('deno', '', 'error: unknown flag', T)).toThrow(/Checked N files/);
  });
});

describe('compareFindings', () => {
  const reference = parseOutput('eslint', ESLINT, '', T);

  it('is identical when every finding matches to the column', () => {
    expect(compareFindings(parseOutput('oxlint', OXLINT, '', T), reference, 4).parity).toBe('identical');
  });

  it('is same-lines when a rule is anchored at another column', () => {
    const r = compareFindings(parseOutput('deno', '', DENO, T), reference, 4);
    expect(r.parity).toBe('same-lines');
    expect(r.extra).toEqual([]);
  });

  it('lists extra and missing findings by line, per rule', () => {
    const mine = { ...reference, findings: [reference.findings[0]!, { file: 'y.ts', line: 1, column: 1, rule: 'no-var' }] };
    const r = compareFindings(mine, reference, 4, (file, line) => file === 'y.ts' && line === 1);
    expect(r.parity).toBe('differs');
    expect(r.extra).toEqual(['y.ts:1 no-var']);
    expect(r.missing).toEqual(['x.ts:3 eqeqeq', 'z.ts parse-error']);
    expect(r.byRule).toEqual({ 'no-var': { extra: 1, missing: 0 }, eqeqeq: { extra: 0, missing: 1 }, 'parse-error': { extra: 0, missing: 1 } });
    expect(r.nearDirective).toEqual({ extra: 1, missing: 0 });
  });

  it('fails a linter that linted another number of files', () => {
    const r = compareFindings({ ...reference, files: 5 }, reference, 4);
    expect(r.parity).toBe('failed');
    expect(r.error).toMatch(/linted 5 files, expected 4/);
  });
});

describe('multisetMinus and parseKey', () => {
  it('counts repeats, since one line can hold two findings of a rule', () => {
    expect(multisetMinus(['a', 'a', 'b'], ['a'])).toEqual(['a', 'b']);
  });

  it('reads a key back, colons in paths included', () => {
    expect(parseKey('src/a:b.ts:12 no-var')).toEqual({ file: 'src/a:b.ts', line: 12, rule: 'no-var' });
    expect(parseKey('src/z.ts parse-error')).toEqual({ file: 'src/z.ts', line: 0, rule: 'parse-error' });
  });
});
