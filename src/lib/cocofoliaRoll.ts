export type DiceRollSummary = {
  name: string;
  target: string;
  dice: string;
  total: string;
  outcome: string;
  tone: 'success' | 'failure';
  label?: string;
  note?: string;
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Escape all log strings before entering the reader's HTML pipeline. */
export function diceRollHtml(roll: DiceRollSummary): string {
  const resultClass = roll.tone === 'success' ? 'text-[#3b5745]' : 'text-[#784b48]';
  const total = roll.total === '—' || roll.total === roll.dice ? '' : ` → ${escapeHtml(roll.total)}`;
  const note = roll.note ? ` · ${escapeHtml(roll.note)}` : '';
  return `<span aria-label="${escapeHtml(roll.label ?? '판정')}" class="whitespace-normal text-[var(--atr-text)]">${escapeHtml(roll.name)} <span class="text-[var(--atr-muted)]">목표치 ${escapeHtml(roll.target)}${note}</span> · ${escapeHtml(roll.dice)}${total} · <span class="${resultClass}">${escapeHtml(roll.outcome)}</span></span>`;
}

export type ShinobigamiRoll = DiceRollSummary & { command: string };

// Read BCDice's resolved command; never evaluate the user's original formula.
const RESOLVED_COMMAND = /\((SG\d*(?:[@#$][+-]?\d+)*(?:[+-]\d+)?(?:>=)(\d+))\)\s*$/i;
const OUTCOMES = /^(?:성공|실패|스페셜|펌블|成功|失敗|スペシャル|ファンブル)(?:\([^\r\n]*\)|（[^\r\n]*）)?$/;

export function parseShinobigamiRoll(text: string): ShinobigamiRoll | null {
  const parts = text.trim().split(/\s*＞\s*|\s+>\s+/);
  const header = parts.shift() ?? '';
  if (!/^SG\b|^SG(?=[\d@#$+>=-])/i.test(header)) return null;
  const resolved = header.match(RESOLVED_COMMAND);
  if (!resolved || parts.length < 2) return null;
  const outcome = parts.pop()!;
  if (!OUTCOMES.test(outcome)) return null;
  // Some special/fumble results have no separate total. Preserve every roll
  // stage, including rerolls and modifiers, instead of recalculating them.
  if (!parts.every(part => /^[\d\s[\],.+*/()−-]+$/.test(part))) return null;
  const separateTotal = parts.length > 1 && /^[+-]?\d+$/.test(parts.at(-1)!);
  const total = separateTotal ? parts.pop()! : '—';
  const commandEnd = header.indexOf('|');
  const name = commandEnd >= 0
    ? header.slice(commandEnd + 1, resolved.index).trim()
    : header.slice(0, resolved.index).replace(/^SG\S*\s*/i, '').trim();
  return {
    name: name || '시노비가미 판정',
    command: resolved[1], target: resolved[2],
    dice: parts.join(' → '), total, outcome,
    tone: /^(?:실패|펌블|失敗|ファンブル)/.test(outcome) ? 'failure' : 'success',
  };
}

/** All source strings are escaped before entering the reader's HTML pipeline. */
export function shinobigamiRollHtml(roll: ShinobigamiRoll): string {
  return diceRollHtml({ ...roll, label: '시노비가미 판정' });
}

const INSANE_HEADER = /^2D6(?:[+-]\d+)?\s*>=\s*\S+\s*(.*?)\s*\((2D6(?:[+-]\d+)?\s*>=\s*(\d+))\)\s*$/i;
const COC_HEADER = /^CCB?(?:[+-]\d+)?\s*<=\s*\S+\s*(.*?)\s*\(1D100\s*<=\s*(\d+)\)\s*(?:(?:보너스,\s*페널티 주사위|ボーナス・ペナルティダイス)\[([+-]?\d+)\])?\s*$/i;
const INSANE_OUTCOME = /^(?:성공|실패|스페셜|펌블|成功|失敗|スペシャル|ファンブル)$/;
const COC_OUTCOME = /^(?:보통 성공|어려운 성공|극단적 성공|대성공|성공|실패|대실패|치명적 실패|レギュラー成功|ハード成功|イクストリーム成功|クリティカル|成功|失敗|ファンブル)$/;
const NUMERIC_ROLL = /^[\d\s[\],.+*/()−-]+$/;

export function parseCocofoliaRoll(text: string): DiceRollSummary | null {
  const shinobigami = parseShinobigamiRoll(text);
  if (shinobigami) return { ...shinobigami, label: '시노비가미 판정' };

  const parts = text.trim().split(/\s*＞\s*|\s+>\s+/);
  const header = parts.shift() ?? '';
  const insane = header.match(INSANE_HEADER);
  const coc = header.match(COC_HEADER);
  if ((!insane && !coc) || parts.length < 2) return null;
  const outcome = parts.pop()!;
  if (!(insane ? INSANE_OUTCOME : COC_OUTCOME).test(outcome)) return null;
  if (!parts.every(part => NUMERIC_ROLL.test(part))) return null;

  const hasTotal = parts.length > 1 && /^[+-]?\d+$/.test(parts.at(-1)!);
  const total = hasTotal ? parts.pop()! : '—';
  const bonus = coc?.[3] ? Number(coc[3]) : 0;
  return {
    name: (insane?.[1] ?? coc?.[1] ?? '').trim() || '판정',
    target: insane?.[3] ?? coc![2],
    dice: parts.join(' → '), total, outcome,
    tone: /실패|펌블|失敗|ファンブル/.test(outcome) ? 'failure' : 'success',
    label: insane ? 'inSANe 판정' : 'CoC 판정',
    ...(bonus ? { note: `${bonus > 0 ? '보너스' : '페널티'} 주사위 ${Math.abs(bonus)}` } : {}),
  };
}

/** Format recognized rolls after source adapters, for every reader format. */
export function formatLogDiceHtml(html: string): string {
  if (!/\b(?:SG|2D6|CC)/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  const preserved = 'table, img, video, audio, pre, code';
  const visit = (element: Element) => {
    if (element.matches(preserved)) return;
    const roll = element.querySelector(preserved) ? null : parseCocofoliaRoll(element.textContent ?? '');
    if (roll) {
      element.innerHTML = diceRollHtml(roll);
      changed = true;
      return;
    }
    Array.from(element.children).forEach(visit);
  };
  visit(doc.body);
  return changed ? doc.body.innerHTML : html;
}
