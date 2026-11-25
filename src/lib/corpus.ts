// Pinned public projects (corpus.json), cloned into the corpus folder at a fixed
// commit. Linting reads source only, so a project needs no install step.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_DIR, ROOT } from './paths.ts';

export interface CorpusProject {
  name: string;
  description: string;
  repo: string;
  sha: string;
  /** Paths left out of the file set, relative to the checkout, with the reason in `excludeNote`. */
  exclude: string[];
  excludeNote?: string;
}

export const corpus: CorpusProject[] = (
  JSON.parse(readFileSync(join(ROOT, 'corpus.json'), 'utf8')) as { projects: CorpusProject[] }
).projects;

export function corpusProject(name: string): CorpusProject {
  const found = corpus.find(p => p.name === name);
  if (!found) throw new Error(`unknown corpus project "${name}"; known: ${corpus.map(p => p.name).join(', ')}`);
  return found;
}

function exec(argv: string[], cwd: string): void {
  const [file, ...args] = argv;
  const r = spawnSync(file!, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${argv.join(' ')} failed in ${cwd} (exit ${r.status})`);
}

/** Clones each project at its pinned commit. */
export function setupCorpus(name?: string): void {
  mkdirSync(CORPUS_DIR, { recursive: true });
  for (const project of name ? [corpusProject(name)] : corpus) {
    const dir = join(CORPUS_DIR, project.name);
    if (!existsSync(dir)) {
      exec(['git', 'init', '-q', dir], ROOT);
      exec(['git', 'remote', 'add', 'origin', project.repo], dir);
    }
    exec(['git', 'fetch', '-q', '--depth', '1', 'origin', project.sha], dir);
    exec(['git', 'checkout', '-q', '--force', project.sha], dir);
    console.log(`${project.name}: ready at ${project.sha.slice(0, 12)}`);
  }
}
