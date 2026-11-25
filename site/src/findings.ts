// The Findings card: each linter's findings compared with the reference's by file,
// line and rule, then, per linter, the rules where they differ most.
import type { ParitySummary, RunSummary } from '../../src/lib/report.ts';
import { familyColor } from './charts.ts';
import { ruleName } from './rules.ts';

const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const count = (n: number): string => n.toLocaleString('en-US');
const pct = (n: number): string => `${(n * 100).toFixed(n === 1 || n === 0 ? 0 : 1)}%`;
const familyOf = (id: string): string => id.slice(0, id.lastIndexOf('@'));

/** How main.ts names a linter: plain text for tooltips, HTML with variant tags for cells. */
export interface Names {
  short(id: string): string;
  nameHtml(id: string): string;
}

const RESULT: Record<ParitySummary['parity'], [kind: string, mark: string, label: string]> = {
  identical: ['ok', '✓', 'Identical'],
  'same-lines': ['ok', '✓', 'Same lines'],
  differs: ['warn', '!', 'Differs'],
  failed: ['bad', '!', 'Failed'],
};

/** "other:n/prefer-node-protocol" is a rule outside the shared set, kept apart in the counts. */
function ruleCell(rule: string, family: string): string {
  if (rule.startsWith('other:')) return `<code>${esc(rule.slice(6))}</code><span class="rule-tag" title="Not in the shared rule set">not shared</span>`;
  const own = ruleName(rule, family);
  return `<code>${esc(rule)}</code>${own && own !== rule ? `<span class="rule-own">${esc(family)}: ${esc(own)}</span>` : ''}`;
}

function findingsTable(run: RunSummary, names: Names): string {
  const row = (p: ParitySummary): string => {
    const reference = p.id === run.reference;
    const [kind, mark, label] = reference ? ['ref', '', 'Reference'] : RESULT[p.parity];
    const failed = p.parity === 'failed';
    const dash = '<span class="muted">n/a</span>';
    return `<tr><td><span class="swatch" style="background:${familyColor(familyOf(p.id))}"></span><span title="${esc(p.id)}">${names.nameHtml(p.id)}</span></td>
      <td><span class="chip ${kind}"${p.error ? ` title="${esc(p.error)}"` : ''}>${mark ? `${mark} ` : ''}${label}</span></td>
      <td class="num strong"${p.outside ? ` title="${count(p.outside)} more outside the shared rules, not compared"` : ''}>${failed ? dash : count(p.findings)}</td>
      <td class="num">${p.files === null ? dash : count(p.files)}</td>
      <td>${reference || failed ? dash : `<div class="meter"><span style="width:${(p.agreement * 100).toFixed(1)}%;background:${familyColor(familyOf(p.id))}"></span></div><span class="meter-value">${pct(p.agreement)}</span>`}</td>
      <td class="num">${reference || failed ? dash : count(p.extra)}</td>
      <td class="num">${reference || failed ? dash : count(p.missing)}</td>
      <td class="num">${reference || failed ? dash : `${count(p.nearDirective.extra)} <span class="muted">/</span> ${count(p.nearDirective.missing)}`}</td></tr>`;
  };
  // The reference first, then the closest match.
  const order = [...run.parity].sort((a, b) => Number(b.id === run.reference) - Number(a.id === run.reference) || b.agreement - a.agreement);
  return `<div class="table-scroll" data-scroll="findings"><table class="data">
    <thead><tr><th>Linter</th><th>Result</th><th class="num">Findings</th><th class="num">Files</th><th>Agreement</th><th class="num">Extra</th><th class="num">Missing</th><th class="num" title="Extra / missing on lines a disable comment covers">Near a directive</th></tr></thead>
    <tbody>${order.map(row).join('')}</tbody></table></div>`;
}

/** One collapsible block per linter that differs: its top rules, extra and missing. */
function differences(run: RunSummary, names: Names): string {
  const differing = run.parity.filter(p => p.id !== run.reference && p.topRules.length);
  if (!differing.length) return '';
  const block = (p: ParitySummary): string => {
    const family = familyOf(p.id);
    const total = p.extra + p.missing;
    return `<details class="differ">
      <summary><span class="swatch" style="background:${familyColor(family)}"></span><span class="differ-name">${names.nameHtml(p.id)}</span>
        <span class="differ-sum">${count(total)} ${total === 1 ? 'difference' : 'differences'}, top ${p.topRules.length} ${p.topRules.length === 1 ? 'rule' : 'rules'}</span></summary>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Rule</th><th class="num">Extra</th><th class="num">Missing</th></tr></thead>
        <tbody>${p.topRules.map(r => `<tr><td>${ruleCell(r.rule, family)}</td><td class="num">${count(r.extra)}</td><td class="num">${count(r.missing)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>`;
  };
  return `<h3 class="sub-head">Where they differ</h3>
    <p class="hint">The rules with the most differences per linter, most first. Open one to see them.</p>
    <div class="differs">${differing.map(block).join('')}</div>`;
}

export function findingsSection(run: RunSummary, names: Names): string {
  const errors = run.parity.filter(p => p.error);
  return `<h2>Findings</h2>
    <p class="hint">Each linter's findings on ${count(run.files)} files with the ${run.rules} <a href="#rules">shared rules</a>, compared with ${esc(names.short(run.reference))} (${count(run.referenceFindings)} findings) by file, line and rule.</p>
    ${findingsTable(run, names)}
    <p class="hint legend-note">Agreement: the share of the reference's findings this linter also reported. Extra: only this linter reported it. Missing: only the reference did. Near a directive: extra and missing on lines a disable comment covers, since each linter honors only its own. Same lines: every finding matches by line, some at another column.</p>
    ${errors.length ? `<ul class="errors">${errors.map(p => `<li><b>${esc(names.short(p.id))}</b>: ${esc(p.error)}</li>`).join('')}</ul>` : ''}
    ${differences(run, names)}`;
}
