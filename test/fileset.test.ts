import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeFileSet, escapeGlob } from '../src/lib/fileset.ts';

let root: string;
const touch = (path: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), 'export {};\n');
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'lint-arena-fileset-')));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('computeFileSet', () => {
  it('lists every JavaScript and TypeScript file, sorted, with "/" separators', () => {
    for (const f of ['src/b.ts', 'src/a.tsx', 'lib/c.mjs', 'lib/d.cjs', 'e.jsx', 'f.mts', 'g.cts', 'h.js', 'README.md']) touch(f);
    expect(computeFileSet(root).files).toEqual(['e.jsx', 'f.mts', 'g.cts', 'h.js', 'lib/c.mjs', 'lib/d.cjs', 'src/a.tsx', 'src/b.ts']);
  });

  it('skips installs, build output and dot folders, and names only the topmost', () => {
    for (const f of ['a.ts', 'node_modules/x/i.js', 'pkg/dist/o.js', '.vitepress/c.ts', 'pkg/.cache/deep/z.ts']) touch(f);
    const set = computeFileSet(root);
    expect(set.files).toEqual(['a.ts']);
    expect(set.excludeDirs.sort()).toEqual(['.vitepress', 'node_modules', 'pkg/.cache', 'pkg/dist']);
  });

  it('skips files some linter reads by default although the arena does not (oxlint reads .vue)', () => {
    for (const f of ['a.ts', 'App.vue', 'x/B.svelte', 'notes.md']) touch(f);
    expect(computeFileSet(root).excludeFiles.sort()).toEqual(['App.vue', 'x/B.svelte']);
  });

  it('skips symbolic links, to files and to folders, so no file is linted twice', () => {
    touch('src/index.js');
    touch('real/x.ts');
    symlinkSync('./src/index.js', join(root, 'linked.js'));
    symlinkSync('./real', join(root, 'alias'));
    const set = computeFileSet(root);
    expect(set.files).toEqual(['real/x.ts', 'src/index.js']);
    expect(set.excludeFiles).toEqual(['linked.js']);
    expect(set.excludeDirs).toEqual(['alias']);
  });

  it('takes extra paths to leave out', () => {
    for (const f of ['a.ts', 'fixtures/bad.ts', 'tests/keep.ts', 'tests/skip.ts']) touch(f);
    expect(computeFileSet(root, ['fixtures', 'tests/skip.ts']).files).toEqual(['a.ts', 'tests/keep.ts']);
  });
});

describe('escapeGlob', () => {
  it('makes glob syntax literal, as in a Next.js route folder', () => {
    expect(escapeGlob('app/[id]/(group)/page.tsx')).toBe('app/\\[id\\]/\\(group\\)/page.tsx');
  });
});
