import { describe, expect, it } from 'vitest';
import { binarySpec, compareVersions, families, inRange, parseTool, threadArgs, toolDir } from '../src/lib/linters.ts';

describe('inRange', () => {
  it('compares only the numeric prefix', () => {
    expect(inRange('10.15.0', '>=9')).toBe(true);
    expect(inRange('8.57.0', '>=9')).toBe(false);
    expect(inRange('2.0.0-beta.3', '>=2')).toBe(true);
    expect(inRange('0.0.1', '*')).toBe(true);
  });
});

describe('compareVersions', () => {
  it('orders by semver precedence', () => {
    expect(['1.94.0', '1.10.0', '1.94.0-beta', '1.9.0'].sort(compareVersions)).toEqual(['1.9.0', '1.10.0', '1.94.0-beta', '1.94.0']);
  });
});

describe('parseTool', () => {
  it('reads family@version, scoped package families included', () => {
    const tool = parseTool('biome@2.6.8');
    expect(tool.family.package).toBe('@biomejs/biome');
    expect(tool.version).toBe('2.6.8');
    expect(toolDir(tool)).toMatch(/tools[\\/]biome@2\.6\.8$/);
  });

  it('wants an exact version in the family range', () => {
    expect(() => parseTool('eslint@latest')).toThrow(/exact version/);
    expect(() => parseTool('eslint')).toThrow(/family@version/);
    expect(() => parseTool('eslint@8.57.0')).toThrow(/outside the eslint family/);
    expect(() => parseTool('jshint@2.13.6')).toThrow(/unknown linter family/);
  });
});

describe('threadArgs', () => {
  it('uses each family\'s documented flag, and none where it documents none', () => {
    expect(threadArgs(parseTool('eslint@10.15.0'), 4)).toEqual(['--concurrency', '4']);
    expect(threadArgs(parseTool('eslint@10.15.0'), 1)).toEqual(['--concurrency', 'off']);
    expect(threadArgs(parseTool('oxlint@1.94.0'), 1)).toEqual(['--threads', '1']);
    expect(threadArgs(parseTool('biome@2.6.8'), 4)).toBeNull();
    expect(threadArgs(parseTool('deno@2.9.6'), 'default')).toEqual([]);
  });
});

describe('binarySpec', () => {
  it('finds the native executable per platform, and none where no build exists', () => {
    expect(binarySpec(parseTool('biome@2.6.8'), 'win32-x64')).toEqual({ package: '@biomejs/cli-win32-x64', file: 'biome.exe' });
    expect(binarySpec(parseTool('deno@2.9.6'), 'linux-arm64')?.package).toBe('@deno/linux-arm64-glibc');
    expect(binarySpec(parseTool('deno@2.9.6'), 'freebsd-x64')).toBeNull();
    expect(binarySpec(parseTool('eslint@10.15.0'), 'freebsd-x64')?.file).toBe('bin/eslint.js');
  });

  it('declares every family the arena knows how to configure and parse', () => {
    expect(families.map(f => f.name).sort()).toEqual(['biome', 'deno', 'eslint', 'oxlint']);
  });
});
