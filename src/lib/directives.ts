// Disable comments in the linted source. Every linter runs as it ships, so each one
// honors its own directives: ESLint and oxlint read `eslint-disable`, oxlint also
// `oxlint-disable`, Biome only `biome-ignore`, Deno only `deno-lint-ignore`. A
// difference on a line such a comment covers is a migration cost (the comment would
// need rewriting), not a disagreement about the code, so reports count it apart.
// Covered by test/directives.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DirectiveCheck } from './findings.ts';

const PREFIX = String.raw`(?:eslint|oxlint|biome-ignore|deno-lint-ignore)`;
const LINE = new RegExp(String.raw`${PREFIX}(?:-disable)?-line\b`);
const NEXT = new RegExp(String.raw`(?:${PREFIX}-disable-next-line|biome-ignore(?!-file)|deno-lint-ignore(?!-file))\b`);
const BLOCK_OFF = /\/\*\s*(?:eslint|oxlint)-disable(?![-\w])([^*]*)\*\//;
const BLOCK_ON = /\/\*\s*(?:eslint|oxlint)-enable(?![-\w])([^*]*)\*\//;
const FILE = /(?:biome-ignore-all|deno-lint-ignore-file)\b/;

/** The rules a directive names, or null when it names none (it covers every rule). */
function named(text: string | undefined): string[] | null {
  const list = (text ?? '').split('--')[0]!.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

const covers = (list: string[] | null, rule: string): boolean => list === null || list.some(r => r === rule || r.endsWith(`/${rule}`));

/** Whether `line` (1-based) of `source` is covered for `rule` by a disable comment. */
export function coveredByDirective(source: string, line: number, rule: string): boolean {
  const lines = source.split(/\r?\n/);
  const here = lines[line - 1] ?? '';
  const before = lines[line - 2] ?? '';
  if (LINE.test(here) || NEXT.test(before)) return true;
  if (FILE.test(source)) return true;
  // Block comments: the last disable or enable above the line decides.
  let off: string[] | null | undefined;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    const disable = BLOCK_OFF.exec(lines[i]!);
    if (disable) off = named(disable[1]);
    const enable = BLOCK_ON.exec(lines[i]!);
    if (enable) off = undefined;
  }
  return off !== undefined && covers(off, rule);
}

/** A DirectiveCheck that reads each file of `target` once. */
export function directiveCheck(target: string): DirectiveCheck {
  const cache = new Map<string, string>();
  return (file, line, rule) => {
    if (!cache.has(file)) {
      try {
        cache.set(file, readFileSync(join(target, file), 'utf8'));
      } catch {
        cache.set(file, '');
      }
    }
    return coveredByDirective(cache.get(file)!, line, rule);
  };
}
