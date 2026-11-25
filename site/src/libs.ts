// The Libs dialog: one card per linter family, from linters.json, saying who
// maintains it, what it is written in and why the arena tests it. It opens on #libs
// so the list can be linked to (see dialog.ts).
import type { Family } from '../../src/lib/linters.ts';
import type { RunSummary } from '../../src/lib/report.ts';
import linters from '../../linters.json' with { type: 'json' };
import { FAMILIES, familyColor } from './charts.ts';
import { mountHashDialog } from './dialog.ts';
import { familyVariants } from './variants.ts';

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const repoName = (url: string): string => url.replace('https://github.com/', '');

const PLATFORMS: Record<string, string> = {
  'darwin-arm64': 'macOS arm64',
  'darwin-x64': 'macOS x64',
  'linux-arm64': 'Linux arm64',
  'linux-x64': 'Linux x64',
  'win32-arm64': 'Windows arm64',
  'win32-x64': 'Windows x64',
};

function platforms(family: Family): string {
  const keys = Object.keys(family.binary);
  return keys.includes('*') ? 'Everywhere Node runs' : keys.map(k => PLATFORMS[k] ?? k).join(', ');
}

/** Versions of a family that appear in any published run, oldest first. Variants fold into their version. */
function tested(family: string, runs: RunSummary[]): string[] {
  const versions = new Set<string>();
  for (const run of runs) {
    for (const setting of run.settings) {
      for (const c of setting.linters) {
        if (c.family !== family) continue;
        versions.add(c.id.slice(c.id.lastIndexOf('@') + 1).replace(/\+.*$/, ''));
      }
    }
  }
  return [...versions].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** Companion packages pinned for every version, such as ESLint's TypeScript parser. */
function companions(family: Family): string {
  const list = Object.entries(family.with ?? {});
  return list.length ? `<dt>With</dt><dd>${list.map(([p, v]) => `<code>${esc(p)}@${esc(v)}</code>`).join(' ')}</dd>` : '';
}

const external = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h-3v9h9v-3M9.5 2.5h4v4M13.5 2.5l-6 6"/></svg>`;

function card(family: Family, runs: RunSummary[]): string {
  const versions = tested(family.name, runs);
  return `<article class="lib">
    <header class="lib-head">
      <h3><span class="swatch" style="background:${familyColor(family.name)}"></span>${esc(family.name)}</h3>
      <span class="lib-by">${esc(family.about.maintainer)}</span>
    </header>
    <p class="lib-summary">${esc(family.description)}</p>
    <p class="lib-why">${esc(family.about.why)}</p>
    <dl class="lib-facts">
      <dt>Written in</dt><dd>${esc(family.about.language)}</dd>
      <dt>npm</dt><dd><code>${esc(family.package)}</code>${family.versions === '*' ? '' : ` <span class="lib-range">${esc(family.versions)}</span>`}</dd>
      <dt>Tested</dt><dd>${
        versions.length
          ? versions
              .map(v => `<a class="lib-version" href="https://www.npmjs.com/package/${esc(family.package)}/v/${esc(v)}" target="_blank" rel="noopener" title="${esc(family.package)}@${esc(v)} on npm"><code>${esc(v)}</code></a>`)
              .join(' ')
          : 'Not in a published run yet'
      }</dd>
      ${companions(family)}
      <dt>Platforms</dt><dd>${esc(platforms(family))}</dd>
      ${familyVariants(family)
        .map(
          v => `<dt>Variant</dt><dd class="lib-variant"><span><code>+${esc(v.name)}</code> runs <code>${esc(v.args.join(' '))}</code>${v.versions ? ` (${esc(family.name)} ${esc(v.versions)})` : ''}</span><span class="lib-variant-text">${esc(v.description)}</span></dd>`
        )
        .join('')}
    </dl>
    <nav class="lib-links">
      <a href="${esc(family.about.repo)}" target="_blank" rel="noopener">${esc(repoName(family.about.repo))}${external}</a>
      <a href="https://www.npmjs.com/package/${esc(family.package)}" target="_blank" rel="noopener">npm${external}</a>
    </nav>
  </article>`;
}

/** Adds the dialog to the page once and keeps it in step with the #libs hash. */
export function mountLibs(runs: RunSummary[]): void {
  // The JSON import infers a union per entry; linters.ts reads the same file as Family[].
  const families = (linters as unknown as { families: Family[] }).families;
  // ESLint first, as the reference every other linter is compared with; the rest follow in chart order.
  const order = (f: Family) => (f.name === 'eslint' ? -1 : FAMILIES.indexOf(f.name));
  mountHashDialog({
    hash: '#libs',
    id: 'libs',
    title: 'The linters',
    hint: 'What each one is, who maintains it, and why it is in the arena.',
    body: `<div class="libs-grid">${[...families].sort((a, b) => order(a) - order(b)).map(f => card(f, runs)).join('')}</div>`,
  });
}
