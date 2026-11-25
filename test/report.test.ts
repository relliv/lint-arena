import { describe, expect, it } from 'vitest';
import type { CorpusProject } from '../src/lib/corpus.ts';
import { projectOf, readTiming } from '../src/lib/report.ts';

const vite = { name: 'vite', repo: 'https://github.com/vitejs/vite', sha: 'pinned', description: 'Frontend tooling monorepo', exclude: [] } as CorpusProject;
const target = (kind: 'corpus' | 'path', commit: string | null, dirty: boolean | null) => ({ kind, commit, dirty });

describe('projectOf', () => {
  it('names the repository and the commit that was actually linted', () => {
    expect(projectOf({ label: 'vite', target: target('corpus', 'cce559ab', false) }, [vite])).toEqual({
      repo: 'https://github.com/vitejs/vite',
      commit: 'cce559ab',
      description: 'Frontend tooling monorepo',
    });
  });

  it('leaves out runs against a path, which may be private', () => {
    expect(projectOf({ label: 'vite', target: target('path', 'cce559ab', false) }, [vite])).toBeUndefined();
  });

  it('leaves out a checkout with no commit or with local changes', () => {
    expect(projectOf({ label: 'vite', target: target('corpus', null, null) }, [vite])).toBeUndefined();
    expect(projectOf({ label: 'vite', target: target('corpus', 'cce559ab', true) }, [vite])).toBeUndefined();
  });
});

describe('readTiming', () => {
  it('reads one row per invocation, warm-ups marked', () => {
    const rows = readTiming('threads,round,warm,linter,real,user,sys,maxrss,exit\ndefault,0,true,oxlint@1.94.0,0.07,0.1,0.9,1048576,1\n1,1,false,oxlint@1.94.0,0.31,0.2,0.1,2097152,1\n');
    expect(rows).toEqual([
      { threads: 'default', round: 0, warm: true, linter: 'oxlint@1.94.0', timing: { real: 0.07, user: 0.1, sys: 0.9, maxrss: 1048576 } },
      { threads: '1', round: 1, warm: false, linter: 'oxlint@1.94.0', timing: { real: 0.31, user: 0.2, sys: 0.1, maxrss: 2097152 } },
    ]);
  });
});
