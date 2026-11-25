// `pnpm arena rules verify`: proves the rule map. Every rule has a fixture,
// fixtures/rules/<id>.js, written to break that rule; every linter lints the whole
// folder with the shared rule set, and must report each fixture's rule in that
// fixture. A rule a linter misses means the map names the wrong rule, or the rules
// do not mean the same thing, and the rule does not belong in the shared set.
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeFileSet } from './fileset.ts';
import { parseOutput } from './findings.ts';
import { type Tool, command, freshDirs } from './linters.ts';
import { capture } from './measure.ts';
import { FIXTURES_DIR } from './paths.ts';
import { prepareConfigDir, rules, writeConfig } from './rules.ts';

export interface VerifyResult {
  tool: string;
  /** Rules whose fixture this linter did not report the rule in. */
  missed: string[];
  /** Fixtures it linted, and how many there are. */
  files: number | null;
  expected: number;
  error?: string;
}

export function verifyRules(tools: Tool[]): VerifyResult[] {
  const target = realpathSync(mkdtempSync(join(tmpdir(), 'lint-arena-rules-')));
  try {
    cpSync(join(FIXTURES_DIR, 'rules'), target, { recursive: true });
    const set = computeFileSet(target);
    prepareConfigDir(target);
    return tools.map(tool => {
      const inv = command(tool, writeConfig(target, tool, set), '.')!;
      const out = capture(inv.argv, target, inv.env);
      for (const d of freshDirs(tool, inv.env)) rmSync(d, { recursive: true, force: true });
      try {
        const parsed = parseOutput(tool.family.name, out.stdout, out.stderr, target);
        const reported = new Set(parsed.findings.map(f => `${f.file} ${f.rule}`));
        const missed = rules.map(r => r.id).filter(id => !reported.has(`${id}.js ${id}`));
        return { tool: tool.id, missed, files: parsed.files, expected: set.files.length };
      } catch (error) {
        return { tool: tool.id, missed: rules.map(r => r.id), files: null, expected: set.files.length, error: `${(error as Error).message}: ${`${out.stdout}${out.stderr}`.slice(0, 400)}` };
      }
    });
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}
