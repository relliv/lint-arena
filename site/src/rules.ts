// The Rules dialog: the shared rule set from rules.json, every rule under each
// family's own name. Findings are compared on these rules only. Opens on #rules.
import rulesFile from '../../rules.json' with { type: 'json' };
import { FAMILIES, familyColor } from './charts.ts';
import { mountHashDialog } from './dialog.ts';

type Family = (typeof FAMILIES)[number];

export interface SharedRule extends Partial<Record<Family, string>> {
  id: string;
}

export const sharedRules: SharedRule[] = (rulesFile as unknown as { rules: SharedRule[] }).rules;

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** A rule's name in one family, or null when the id is not in the shared set. */
export function ruleName(id: string, family: string): string | null {
  return sharedRules.find(r => r.id === id)?.[family as Family] ?? null;
}

/** ESLint first, as the reference, then the chart order. */
const COLUMNS: Family[] = ['eslint', ...FAMILIES.filter(f => f !== 'eslint')];

export function mountRules(): void {
  const head = COLUMNS.map(f => `<th><span class="swatch" style="background:${familyColor(f)}"></span>${esc(f)}</th>`).join('');
  const rows = [...sharedRules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => `<tr><td class="rule-id">${esc(r.id)}</td>${COLUMNS.map(f => `<td>${r[f] ? `<code>${esc(r[f])}</code>` : '<span class="muted">none</span>'}</td>`).join('')}</tr>`)
    .join('');
  mountHashDialog({
    hash: '#rules',
    id: 'rules',
    title: `The ${sharedRules.length} shared rules`,
    hint: 'Rules every linter implements, under the name each one gives it. Findings are compared on these rules only.',
    body: `<div class="rules-table"><div class="table-scroll"><table class="data">
      <thead><tr><th>Rule</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`,
  });
}
