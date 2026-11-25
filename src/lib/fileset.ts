// The files a run lints, decided once by the arena and handed to every linter.
//
// Linters disagree about what a folder contains: which extensions count, whether
// .gitignore applies, whether dot folders are skipped, and each has its own glob
// dialect (Deno's exclude takes literal paths, oxlint resolves patterns from its
// config's folder). So the arena walks the target itself and writes the result into
// every config as literal paths: the topmost folders to skip and the single files
// to skip. Each linter then reports how many files it linted, and a linter whose
// count differs is not timed. Covered by test/fileset.test.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The extensions every family lints. */
export const LINTED = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'] as const;

/** Extensions some family lints by default although the arena does not (oxlint reads script blocks). */
export const FOREIGN = ['vue', 'svelte', 'astro'] as const;

const LINTED_RE = new RegExp(`\\.(${LINTED.join('|')})$`);
const FOREIGN_RE = new RegExp(`\\.(${FOREIGN.join('|')})$`);

/** Folder names never linted, wherever they are: installs and build output. */
export const SKIPPED_DIRS = ['node_modules', 'dist'];

export interface FileSet {
  /** Every file linted, relative to the target, with "/" separators, sorted. */
  files: string[];
  /** Topmost folders to skip, relative to the target. */
  excludeDirs: string[];
  /** Single files to skip that a linter would otherwise read. */
  excludeFiles: string[];
}

/** Paths git ignores in `target` (folders end in "/"), or none outside a repository. */
export function gitIgnored(target: string): Set<string> {
  if (!existsSync(join(target, '.git'))) return new Set();
  const r = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], { cwd: target, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) return new Set();
  return new Set(r.stdout.split('\0').filter(Boolean));
}

/**
 * Walks `target`. `exclude` lists more paths to skip, relative to the target (a
 * corpus project's fixtures, for example). Dot folders and dot files, symbolic
 * links, the folders in SKIPPED_DIRS and what git ignores are skipped.
 */
export function computeFileSet(target: string, exclude: string[] = []): FileSet {
  const ignored = gitIgnored(target);
  const extra = new Set(exclude.map(p => p.replace(/\\/g, '/').replace(/\/$/, '')));
  const files: string[] = [];
  const excludeDirs: string[] = [];
  const excludeFiles: string[] = [];

  const walk = (rel: string): void => {
    const abs = rel ? join(target, rel) : target;
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const isLink = entry.isSymbolicLink();
      const isDir = entry.isDirectory() || (isLink && safeIsDir(join(abs, entry.name)));
      if (isDir) {
        if (path === '.git') continue;
        const skip = entry.name.startsWith('.') || SKIPPED_DIRS.includes(entry.name) || isLink || ignored.has(`${path}/`) || extra.has(path);
        if (skip) excludeDirs.push(path);
        else walk(path);
        continue;
      }
      const linted = LINTED_RE.test(entry.name);
      const foreign = FOREIGN_RE.test(entry.name);
      if (!linted && !foreign) continue;
      const skip = foreign || entry.name.startsWith('.') || isLink || ignored.has(path) || extra.has(path);
      if (skip) excludeFiles.push(path);
      else files.push(path);
    }
  };
  walk('');
  return { files, excludeDirs, excludeFiles };
}

/** Whether a symbolic link points at a folder; a broken link is not one. */
function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Escapes glob syntax so a literal path matches only itself (ESLint, oxlint and Biome take globs). */
export const escapeGlob = (path: string): string => path.replace(/[*?[\]{}()!+@\\]/g, c => `\\${c}`);
