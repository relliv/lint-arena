import { spawnSync } from 'node:child_process';

/** The commit a target is at, and whether tracked files differ from it; nulls outside git. */
export function targetRevision(target: string): { commit: string | null; dirty: boolean | null } {
  const git = (args: string[]) => spawnSync('git', args, { cwd: target, encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, dirty: null };
  return { commit: head.stdout.trim(), dirty: git(['status', '--porcelain', '--untracked-files=no']).stdout.trim() !== '' };
}
