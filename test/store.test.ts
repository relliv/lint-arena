import { describe, expect, it } from 'vitest';
import { parseTool } from '../src/lib/linters.ts';
import { KEEP_VERSIONS, toolManifest, toPrune } from '../src/lib/store.ts';

const ids = (list: { id: string }[]) => list.map(t => t.id);

describe('toPrune', () => {
  it('keeps the newest versions of each family and names the rest, oldest first', () => {
    const tools = ['oxlint@1.90.0', 'oxlint@1.94.0', 'oxlint@1.92.0', 'oxlint@1.93.0', 'oxlint@1.89.0'].map(parseTool);
    expect(KEEP_VERSIONS).toBe(3);
    expect(ids(toPrune(tools))).toEqual(['oxlint@1.89.0', 'oxlint@1.90.0']);
  });

  it('orders by version, not by name', () => {
    const tools = ['eslint@10.9.0', 'eslint@10.14.0', 'eslint@10.10.0', 'eslint@9.39.0'].map(parseTool);
    expect(ids(toPrune(tools))).toEqual(['eslint@9.39.0']);
  });

  it('leaves families at or under their count alone', () => {
    expect(toPrune(['biome@2.6.7', 'deno@2.9.5', 'deno@2.9.6'].map(parseTool))).toEqual([]);
  });
});

describe('toolManifest', () => {
  it('pins the family companions next to the linter', () => {
    const manifest = JSON.parse(toolManifest(parseTool('eslint@10.15.0'))) as { dependencies: Record<string, string> };
    expect(manifest.dependencies['eslint']).toBe('10.15.0');
    expect(manifest.dependencies['@typescript-eslint/parser']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.dependencies['@typescript-eslint/eslint-plugin']).toBe(manifest.dependencies['@typescript-eslint/parser']);
  });
});
