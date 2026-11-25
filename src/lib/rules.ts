// The shared rule set (rules.json) and the configs that turn it on, one per family.
// Every config enables exactly these rules and nothing else, reads no project config,
// and skips the same literal paths (fileset.ts), so every linter is asked the same
// question. Configs are written inside the target, in .lint-arena/<tool>/, because
// some linters resolve patterns from their config's folder; that folder ignores
// itself through its own .gitignore and is removed after the run.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type FileSet, FOREIGN, LINTED, escapeGlob } from './fileset.ts';
import { type FamilyName, type Tool, companionPath } from './linters.ts';
import { ROOT } from './paths.ts';

export interface Rule {
  /** The canonical name, ESLint's core rule name. */
  id: string;
  eslint: string;
  oxlint: string;
  /** group/name, such as suspicious/noDebugger. */
  biome: string;
  deno: string;
  /** Options `biome migrate eslint` writes so Biome matches ESLint's defaults. */
  biomeOptions?: Record<string, unknown>;
}

export const rules: Rule[] = (JSON.parse(readFileSync(join(ROOT, 'rules.json'), 'utf8')) as { rules: Rule[] }).rules;

/** A finding that is not a rule: the file could not be parsed. */
export const PARSE_ERROR = 'parse-error';

/**
 * Maps a family's own rule code back to the canonical id: eslint "no-debugger" or
 * "@typescript-eslint/no-unused-vars", oxlint "eslint(no-debugger)", Biome
 * "lint/suspicious/noDebugger", Deno "no-debugger". Codes outside the rule set
 * come back as "other:<code>", which a run reports but never expects.
 */
export function canonicalRule(familyName: FamilyName, code: string): string {
  const key =
    familyName === 'oxlint' ? (/^[\w-]+\((.+)\)$/.exec(code)?.[1] ?? code) : familyName === 'biome' ? code.replace(/^lint\//, '') : code;
  const rule = rules.find(r => r[familyName] === key);
  return rule ? rule.id : `other:${code}`;
}

/** The folder a run's configs live in, inside the target. */
export const CONFIG_DIR = '.lint-arena';

/** Configs live two folders down (.lint-arena/<tool>/), so paths in them start here. */
const UP = '../..';

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The entry module of a companion package, as a file URL a config can import. */
function companionImport(tool: Tool, pkg: string): string {
  const dir = companionPath(tool, pkg);
  return pathToFileURL(createRequire(join(dir, 'package.json')).resolve(pkg)).href;
}

/** A written config: its path, relative to the target, and any arguments it needs beside it. */
export interface LintConfig {
  path: string;
  args: string[];
}

/**
 * Windows limits a command line to 32,767 characters; oxlint takes its skipped paths
 * as arguments, so a target whose list would not fit is refused rather than cut.
 */
export const MAX_ARGS_LENGTH = 30000;

/** Writes the config for `tool`. */
export function writeConfig(target: string, tool: Tool, set: FileSet, ruleSet: Rule[] = rules): LintConfig {
  const dir = join(target, CONFIG_DIR, tool.id);
  mkdirSync(dir, { recursive: true });
  const rel = (file: string) => `${CONFIG_DIR}/${tool.id}/${file}`;
  const linted = `**/*.{${LINTED.join(',')}}`;
  switch (tool.family.name) {
    case 'eslint': {
      // ESLint reads a relative basePath for files but not for global ignores, which
      // stay relative to the config's folder; an absolute basePath works for both.
      const base = target;
      const ignores = [`${CONFIG_DIR}/`, ...set.excludeDirs.map(d => `${escapeGlob(d)}/`), ...set.excludeFiles.map(escapeGlob)];
      const enabled = Object.fromEntries(ruleSet.map(r => [r.eslint, 'error']));
      const text = [
        `// Written by lint-arena for one run: the shared rule set, and nothing else.`,
        `import parser from ${JSON.stringify(companionImport(tool, '@typescript-eslint/parser'))};`,
        `import plugin from ${JSON.stringify(companionImport(tool, '@typescript-eslint/eslint-plugin'))};`,
        `export default [`,
        `  { basePath: ${JSON.stringify(base)}, ignores: ${JSON.stringify(ignores)} },`,
        `  {`,
        `    basePath: ${JSON.stringify(base)},`,
        `    files: [${JSON.stringify(linted)}],`,
        `    plugins: { '@typescript-eslint': plugin },`,
        `    languageOptions: { parser, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },`,
        `    linterOptions: { reportUnusedDisableDirectives: 'off' },`,
        `    rules: ${JSON.stringify(enabled)},`,
        `  },`,
        `  { basePath: ${JSON.stringify(base)}, files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },`,
        `];`,
      ].join('\n');
      writeFileSync(join(dir, 'eslint.config.mjs'), `${text}\n`);
      return { path: rel('eslint.config.mjs'), args: [] };
    }
    case 'oxlint': {
      // oxlint resolves ignorePatterns and --ignore-path files from their own folder
      // and refuses "..", so the skipped paths go on the command line, from the target.
      const categories = ['correctness', 'suspicious', 'pedantic', 'perf', 'style', 'restriction', 'nursery'];
      writeJson(join(dir, 'oxlintrc.json'), {
        plugins: [],
        categories: Object.fromEntries(categories.map(c => [c, 'off'])),
        rules: Object.fromEntries(ruleSet.map(r => [r.oxlint, 'error'])),
      });
      const patterns = [`${CONFIG_DIR}/`, ...set.excludeDirs.map(d => `${escapeGlob(d)}/`), ...set.excludeFiles.map(escapeGlob), ...FOREIGN.map(ext => `**/*.${ext}`)];
      const args = patterns.flatMap(p => ['--ignore-pattern', p]);
      const length = args.reduce((n, a) => n + a.length + 3, 0);
      if (process.platform === 'win32' && length > MAX_ARGS_LENGTH) {
        throw new Error(`${tool.id}: ${patterns.length} skipped paths need ${length} characters of arguments, more than Windows allows`);
      }
      return { path: rel('oxlintrc.json'), args };
    }
    case 'biome': {
      const groups: Record<string, Record<string, unknown>> = {};
      for (const r of ruleSet) {
        const [group, name] = r.biome.split('/') as [string, string];
        groups[group] ??= {};
        groups[group]![name] = r.biomeOptions ? { level: 'error', options: r.biomeOptions } : 'error';
      }
      writeJson(join(dir, 'biome.json'), {
        root: true,
        vcs: { enabled: false },
        formatter: { enabled: false },
        assist: { enabled: false },
        files: {
          maxSize: 1 << 30,
          includes: [linted, `!${CONFIG_DIR}`, ...set.excludeDirs.map(d => `!${escapeGlob(d)}`), ...set.excludeFiles.map(f => `!${escapeGlob(f)}`)],
        },
        linter: { enabled: true, rules: { preset: 'none', ...groups } },
      });
      return { path: rel('biome.json'), args: [] };
    }
    case 'deno': {
      writeJson(join(dir, 'deno.json'), {
        lint: {
          include: [`${UP}/`],
          exclude: [`${UP}/${CONFIG_DIR}/`, ...set.excludeDirs.map(d => `${UP}/${d}/`), ...set.excludeFiles.map(f => `${UP}/${f}`)],
          rules: { tags: [], include: ruleSet.map(r => r.deno) },
        },
      });
      return { path: rel('deno.json'), args: [] };
    }
  }
}

/** Writes the folder's own .gitignore, so a run never shows up in the target's git status. */
export function prepareConfigDir(target: string): void {
  mkdirSync(join(target, CONFIG_DIR), { recursive: true });
  writeFileSync(join(target, CONFIG_DIR, '.gitignore'), '*\n');
}

export function removeConfigDir(target: string): void {
  rmSync(join(target, CONFIG_DIR), { recursive: true, force: true });
}
