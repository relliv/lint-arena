import { describe, expect, it } from 'vitest';
import { coveredByDirective } from '../src/lib/directives.ts';

describe('coveredByDirective', () => {
  it('sees line and next-line comments of every family', () => {
    expect(coveredByDirective('debugger; // eslint-disable-line', 1, 'no-debugger')).toBe(true);
    expect(coveredByDirective('// oxlint-disable-next-line no-debugger\ndebugger;', 2, 'no-debugger')).toBe(true);
    expect(coveredByDirective('// biome-ignore lint/suspicious/noDebugger: test\ndebugger;', 2, 'no-debugger')).toBe(true);
    expect(coveredByDirective('// deno-lint-ignore no-debugger\ndebugger;', 2, 'no-debugger')).toBe(true);
    expect(coveredByDirective('const a = 1;\ndebugger;', 2, 'no-debugger')).toBe(false);
  });

  it('follows block comments until they are enabled again, and the rules they name', () => {
    const source = ['/* eslint-disable no-console */', 'console.log(1);', 'debugger;', '/* eslint-enable */', 'console.log(2);'].join('\n');
    expect(coveredByDirective(source, 2, 'no-console')).toBe(true);
    expect(coveredByDirective(source, 3, 'no-debugger')).toBe(false);
    expect(coveredByDirective(source, 5, 'no-console')).toBe(false);
  });

  it('treats a block comment that names no rule as covering every rule', () => {
    expect(coveredByDirective('/* eslint-disable */\nvar a = 1;', 2, 'no-var')).toBe(true);
  });

  it('matches a rule named with its plugin prefix', () => {
    expect(coveredByDirective('/* eslint-disable @typescript-eslint/no-unused-vars */\nconst a = 1;', 2, 'no-unused-vars')).toBe(true);
  });

  it('honors whole-file ignores', () => {
    expect(coveredByDirective('// deno-lint-ignore-file\n\nvar a = 1;', 3, 'no-var')).toBe(true);
  });
});
