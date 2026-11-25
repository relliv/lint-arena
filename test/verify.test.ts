import { describe, expect, it } from 'vitest';
import { availableOn, binaryPath, compareVersions, families } from '../src/lib/linters.ts';
import { listTools } from '../src/lib/store.ts';
import { verifyRules } from '../src/lib/verify.ts';

// The newest installed version of each family: a release that changes what a shared
// rule means fails here, before a run reports it as a disagreement.
const newest = families.flatMap(f =>
  listTools()
    .filter(t => t.family.name === f.name && availableOn(t) && binaryPath(t))
    .sort((a, b) => compareVersions(a.version, b.version))
    .slice(-1)
);

describe.skipIf(newest.length === 0)('rules verify', () => {
  it('every linter reports each shared rule in its fixture', { timeout: 120_000 }, () => {
    const results = verifyRules(newest);
    for (const r of results) expect({ tool: r.tool, missed: r.missed, files: r.files, error: r.error }).toEqual({ tool: r.tool, missed: [], files: r.expected, error: undefined });
  });
});
