import type { SectionUpdate } from './types';

export interface ExpenseKpi {
  label: string;
  value: string;
  delta: string | null;
  emphasis: boolean;
  tone: 'good' | 'bad' | null;
}

export type ExpenseHeroTone = 'good' | 'bad' | 'neutral';

export interface ExpenseHeroLine {
  text: string;
  tone: ExpenseHeroTone | null;
}

export interface ExpenseHeroSide {
  text: string;
  tone: ExpenseHeroTone | null;
}

export interface ExpenseHero {
  label: string | null;
  value: string;
  tone: ExpenseHeroTone | null;
  /** Sits on the hero value's row, flush to the right edge. */
  side: ExpenseHeroSide | null;
  lines: ExpenseHeroLine[];
}

export interface ExpenseDiffItem {
  label: string;
  value: string;
  delta: number | string | null;
  /** Explicit percent. When null, it is derived from `value` and `delta`. */
  deltaPct: number | null;
  /** `auto` or null follows the sign of `delta`: up is bad, down is good, zero is neutral. */
  tone: ExpenseHeroTone | 'auto' | null;
}

export interface ExpenseView {
  id: string;
  label: string;
  /** Block `id`s or indexes in the original `blocks` array. */
  blocks: (string | number)[];
}

export type ExpenseTone = 'good' | 'bad';

export interface ExpenseSeries {
  name: string | null;
  values: number[];
  color: string | null;
  /** Per-bar tone, aligned with `values`. Null keeps the default color. */
  tones: (ExpenseTone | null)[];
}

export interface ExpenseSegment {
  label: string;
  value: number;
  color: string | null;
}

export interface ExpenseListItem {
  label: string;
  amount: string | null;
  date: string | null;
  status: string | null;
  comment: string | null;
}

export interface ExpenseTableRow {
  cells: string[];
  comment: string | null;
}

export interface ExpenseDrillItem {
  id: string;
  label: string;
  sharePct: number | null;
  change: string | null;
  values: number[];
}

export type ExpenseBlock =
  | { type: 'kpi'; title: string | null; hero: ExpenseHero | null; items: ExpenseKpi[] }
  | {
      type: 'bars';
      title: string | null;
      unit: string | null;
      labels: string[];
      /** One entry per label. `null` means the point belongs to no group. */
      groups: (PointGroup | null)[];
      highlight: number | null;
      series: ExpenseSeries[];
      showValues: boolean;
      trend: boolean;
      /** Negative bars are bad and positive bars are good. */
      signTone: boolean;
      lineSeries: ExpenseSeries[];
    }
  | {
      type: 'drilldown';
      title: string | null;
      labels: string[];
      unit: string | null;
      selected: string | null;
      items: ExpenseDrillItem[];
    }
  | {
      type: 'donut';
      title: string | null;
      center: string | null;
      /** Set when the label was rounded. `0` also draws a thicker ring. */
      centerDecimals: number | null;
      segments: ExpenseSegment[];
    }
  | { type: 'diff'; title: string | null; items: ExpenseDiffItem[] }
  | { type: 'line'; title: string | null; labels: string[]; values: number[] }
  | { type: 'table'; title: string | null; columns: string[]; rows: ExpenseTableRow[] }
  | { type: 'list'; title: string | null; items: ExpenseListItem[] }
  | { type: 'text'; title: string | null; text: string };

export interface ExpensesTileModel {
  period: string | null;
  total: number | string | null;
  /** When false, the right-aligned header amount is omitted even if `total` is set. */
  showTotal: boolean;
  currency: string | null;
  views: ExpenseView[];
  defaultView: string | null;
  blocks: Array<ExpenseBlock & { id: string | null; sourceIndex: number }>;
}

const PALETTE = ['#7dcea0', '#e2a53a', '#8eb4d4', '#d4a0c0', '#c4b48a', '#9bb89a'];

/** True when this push should use the generic expenses tile, whatever its section name is. */
export function isExpensesTile(
  update: Pick<SectionUpdate, 'section'> & { renderer?: unknown; type?: unknown },
): boolean {
  return update.renderer === 'expenses' || update.type === 'expenses';
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function titleOf(block: Record<string, unknown>): string | null {
  return text(block.title);
}

function colorOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : null;
}

function heroTone(value: unknown): ExpenseHeroTone | null | undefined {
  if (value == null) return null;
  if (value === 'good' || value === 'bad' || value === 'neutral') return value;
  return undefined;
}

function readSide(raw: unknown): ExpenseHeroSide | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const sideText = text(row.text);
  const tone = heroTone(row.tone);
  if (!sideText || tone === undefined) return null;
  return { text: sideText, tone };
}

function readHero(raw: unknown): ExpenseHero | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const value = text(row.value) ?? (finite(row.value) !== null ? String(row.value) : null);
  const tone = heroTone(row.tone);
  if (!value || tone === undefined) return null;
  let side: ExpenseHeroSide | null = null;
  if (row.side != null) {
    side = readSide(row.side);
    if (!side) return null;
  }
  const lines: ExpenseHeroLine[] = [];
  if (Array.isArray(row.lines)) {
    for (const entry of row.lines) {
      if (!entry || typeof entry !== 'object') continue;
      const line = entry as Record<string, unknown>;
      const lineText = text(line.text);
      const lineTone = heroTone(line.tone);
      if (!lineText || lineTone === undefined) continue;
      lines.push({ text: lineText, tone: lineTone });
    }
  }
  return { label: text(row.label), value, tone, side, lines };
}

function readKpi(block: Record<string, unknown>): ExpenseBlock | null {
  const hero = block.hero == null ? null : readHero(block.hero);
  if (block.hero != null && !hero) return null;
  const items: ExpenseKpi[] = [];
  if (Array.isArray(block.items)) {
    for (const entry of block.items) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const label = text(row.label);
      const value = text(row.value) ?? (finite(row.value) !== null ? String(row.value) : null);
      if (!label || !value) continue;
      const tone = row.tone === 'good' || row.tone === 'bad' ? row.tone : null;
      items.push({ label, value, delta: text(row.delta), emphasis: row.emphasis === true, tone });
    }
  }
  if (items.length === 0 && !hero) return null;
  return { type: 'kpi', title: titleOf(block), hero, items };
}

function readDiff(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.items)) return null;
  const items: ExpenseDiffItem[] = [];
  for (const entry of block.items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const label = text(row.label);
    const value = text(row.value) ?? (finite(row.value) !== null ? String(row.value) : null);
    if (!label || !value) continue;
    const numeric = finite(row.delta);
    const delta = numeric !== null ? numeric : text(row.delta);
    const deltaPct = finite(row.delta_pct);
    if (row.delta_pct != null && deltaPct === null) continue;
    const tone = row.tone == null ? null : row.tone === 'auto' ? 'auto' : heroTone(row.tone);
    if (tone === undefined) continue;
    items.push({ label, value, delta, deltaPct, tone });
  }
  if (items.length === 0) return null;
  return { type: 'diff', title: titleOf(block), items };
}

function toneOf(value: unknown): ExpenseTone | null | undefined {
  if (value == null) return null;
  if (value === 'good' || value === 'bad') return value;
  return undefined;
}

function readPoints(raw: unknown[]): { values: number[]; tones: (ExpenseTone | null)[] } | null {
  const values: number[] = [];
  const tones: (ExpenseTone | null)[] = [];
  for (const entry of raw) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      values.push(entry);
      tones.push(null);
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>;
      const value = finite(row.value);
      const tone = toneOf(row.tone);
      if (value === null || tone === undefined) return null;
      values.push(value);
      tones.push(tone);
      continue;
    }
    return null;
  }
  return { values, tones };
}

function readSeriesList(raw: unknown, labelCount: number): ExpenseSeries[] | null {
  if (!Array.isArray(raw)) return null;
  const series: ExpenseSeries[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    if (!Array.isArray(row.values) || row.values.length !== labelCount) return null;
    const points = readPoints(row.values);
    if (!points) return null;
    let tones = points.tones;
    if (row.tones != null) {
      if (!Array.isArray(row.tones) || row.tones.length !== labelCount) return null;
      const listed = row.tones.map((tone) => toneOf(tone));
      if (listed.some((tone) => tone === undefined)) return null;
      tones = listed.map((tone, index) => tone ?? points.tones[index]);
    }
    series.push({
      name: text(row.name),
      values: points.values,
      color: colorOf(row.color),
      tones,
    });
  }
  return series;
}

function readNumberList(raw: unknown, count: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== count) return null;
  const values = raw.map((value) => finite(value));
  if (values.some((value) => value === null)) return null;
  return values as number[];
}

function readBars(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.labels) || !Array.isArray(block.series)) return null;
  const labels = block.labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '');
  if (labels.length === 0) return null;
  const series = readSeriesList(block.series, labels.length);
  if (!series || series.length === 0) return null;
  const lineSeries = block.line_series == null ? [] : readSeriesList(block.line_series, labels.length);
  if (block.line_series != null && !lineSeries) return null;
  const highlight = finite(block.highlight);
  // `groups` is parallel to `labels`. Without it the " r" / " w" label suffix is the fallback.
  const sent = Array.isArray(block.groups) && block.groups.length === labels.length ? block.groups : null;
  const groups = labels.map((label, index) => (sent ? readPointGroup(sent[index]) : suffixGroupOf(label)));
  return {
    type: 'bars',
    title: titleOf(block),
    unit: text(block.unit),
    labels,
    groups,
    highlight: highlight !== null && highlight >= 0 && highlight < labels.length ? highlight : null,
    series,
    showValues: block.show_values === true,
    trend: block.trend === true,
    signTone: block.sign_tone === true,
    lineSeries: lineSeries ?? [],
  };
}

function readDrilldown(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.labels) || !Array.isArray(block.items)) return null;
  const labels = block.labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '');
  if (labels.length === 0) return null;
  const items: ExpenseDrillItem[] = [];
  for (const entry of block.items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = text(row.id);
    const label = text(row.label);
    const values = readNumberList(row.series, labels.length);
    if (!id || !label || !values) continue;
    items.push({ id, label, sharePct: finite(row.share_pct), change: text(row.change), values });
  }
  if (items.length === 0) return null;
  const selected = text(block.selected);
  return {
    type: 'drilldown',
    title: titleOf(block),
    labels,
    unit: text(block.unit),
    selected: selected && items.some((item) => item.id === selected) ? selected : null,
    items,
  };
}

function readDonut(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.segments)) return null;
  const segments: ExpenseSegment[] = [];
  for (const entry of block.segments) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const label = text(row.label);
    const value = finite(row.value);
    if (!label || value === null) continue;
    segments.push({ label, value, color: colorOf(row.color) });
  }
  if (segments.length === 0) return null;
  const decimals = finite(block.center_decimals);
  if (block.center_decimals != null && (decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 2)) {
    return null;
  }
  const center = formatDonutCenter(block.center, decimals);
  return { type: 'donut', title: titleOf(block), center, centerDecimals: decimals, segments };
}

function readLine(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.values) || block.values.length === 0) return null;
  const values = block.values.map((value) => finite(value));
  if (values.some((value) => value === null)) return null;
  const labels = Array.isArray(block.labels)
    ? block.labels.map((label) => (typeof label === 'string' ? label : ''))
    : [];
  return {
    type: 'line',
    title: titleOf(block),
    labels: labels.length === values.length ? labels : values.map((_, index) => String(index + 1)),
    values: values as number[],
  };
}

function cellText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readTable(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.columns) || !Array.isArray(block.rows)) return null;
  const columns = block.columns.filter((column): column is string => typeof column === 'string' && column.trim() !== '');
  if (columns.length === 0) return null;
  const rows: ExpenseTableRow[] = [];
  for (const entry of block.rows) {
    if (Array.isArray(entry)) {
      rows.push({ cells: entry.map((cell) => cellText(cell) ?? ''), comment: null });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (!Array.isArray(row.cells)) continue;
    rows.push({ cells: row.cells.map((cell) => cellText(cell) ?? ''), comment: text(row.comment) });
  }
  return { type: 'table', title: titleOf(block), columns, rows };
}

function readList(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.items)) return null;
  const items: ExpenseListItem[] = [];
  for (const entry of block.items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const label = text(row.label);
    if (!label) continue;
    const amount = text(row.amount) ?? (finite(row.amount) !== null ? String(row.amount) : null);
    items.push({
      label,
      amount,
      date: text(row.date),
      status: text(row.status)?.toLowerCase() ?? null,
      comment: text(row.comment),
    });
  }
  return { type: 'list', title: titleOf(block), items };
}

function readText(block: Record<string, unknown>): ExpenseBlock | null {
  const body = text(block.text);
  if (!body) return null;
  return { type: 'text', title: titleOf(block), text: body };
}

function readBlock(value: unknown): ExpenseBlock | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  switch (block.type) {
    case 'kpi':
      return readKpi(block);
    case 'bars':
      return readBars(block);
    case 'drilldown':
      return readDrilldown(block);
    case 'donut':
      return readDonut(block);
    case 'diff':
      return readDiff(block);
    case 'line':
      return readLine(block);
    case 'table':
      return readTable(block);
    case 'list':
      return readList(block);
    case 'text':
    case 'note':
      return readText(block);
    default:
      return null;
  }
}

function readViewRefs(raw: unknown, blockCount: number, ids: ReadonlySet<string>): (string | number)[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const refs: (string | number)[] = [];
  for (const entry of raw) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < blockCount) {
      refs.push(entry);
      continue;
    }
    if (typeof entry === 'string' && ids.has(entry)) {
      refs.push(entry);
      continue;
    }
    return null;
  }
  return refs;
}

function readViews(raw: unknown, blockCount: number, ids: ReadonlySet<string>): ExpenseView[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const views: ExpenseView[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const id = text(row.id);
    const label = text(row.label);
    const blocks = readViewRefs(row.blocks, blockCount, ids);
    if (!id || !label || !blocks || seen.has(id)) return [];
    seen.add(id);
    views.push({ id, label, blocks });
  }
  return views;
}

/** Indexes of blocks to draw. Blocks named by no view stay visible in every view. */
export function visibleBlockIndexes(
  blocks: ReadonlyArray<{ id: string | null; sourceIndex: number }>,
  views: readonly ExpenseView[],
  selectedId: string | null,
): number[] {
  if (views.length === 0) return blocks.map((_, index) => index);
  const selected = views.find((view) => view.id === selectedId) ?? views[0];
  const matches = (block: { id: string | null; sourceIndex: number }, refs: readonly (string | number)[]) =>
    refs.some((ref) => ref === block.sourceIndex || (typeof ref === 'string' && ref === block.id));
  const owned = new Set<number>();
  for (const view of views) {
    blocks.forEach((block, index) => {
      if (matches(block, view.blocks)) owned.add(index);
    });
  }
  return blocks
    .map((_, index) => index)
    .filter((index) => !owned.has(index) || matches(blocks[index], selected.blocks));
}

export function readExpensesTile(update: SectionUpdate): ExpensesTileModel {
  const rawBlocks = Array.isArray(update.blocks) ? update.blocks : [];
  const blocks = rawBlocks.flatMap((raw, sourceIndex) => {
    const block = readBlock(raw);
    if (!block) return [];
    const id = raw && typeof raw === 'object' ? text((raw as Record<string, unknown>).id) : null;
    return [{ ...block, id, sourceIndex }];
  });
  const ids = new Set(blocks.flatMap((block) => (block.id ? [block.id] : [])));
  const views = readViews(update.views, rawBlocks.length, ids);
  const requested = text(update.default_view);
  const totalValue = update.total;
  const total =
    typeof totalValue === 'number' && Number.isFinite(totalValue)
      ? totalValue
      : text(totalValue);
  return {
    period: text(update.period),
    total,
    showTotal: update.show_total !== false,
    currency: text(update.currency),
    views,
    defaultView: requested && views.some((view) => view.id === requested) ? requested : (views[0]?.id ?? null),
    blocks,
  };
}

/** Up is bad, down is good, zero is neutral. An explicit tone wins over `auto`. */
export function diffTone(delta: number | string | null, tone: ExpenseHeroTone | 'auto' | null): ExpenseHeroTone {
  if (tone && tone !== 'auto') return tone;
  const value = typeof delta === 'number' ? delta : signedAmount(delta);
  if (value === null || value === 0) return 'neutral';
  return value > 0 ? 'bad' : 'good';
}

function signedAmount(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '').replace('−', '-').replace(',', '.');
  const match = /^([+-]?)(\d+(?:\.\d+)?)/.exec(cleaned);
  if (!match) return null;
  const amount = Number(match[2]);
  if (!Number.isFinite(amount)) return null;
  return match[1] === '-' ? -amount : amount;
}

export function formatDiffDelta(delta: number | string | null): string | null {
  if (delta === null) return null;
  if (typeof delta === 'string') return delta;
  const formatted = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(Math.abs(delta));
  if (delta > 0) return `+${formatted}`;
  if (delta < 0) return `−${formatted}`;
  return formatted;
}

function formatSignedMoney(amount: number, unit: string | null): string {
  const formatted = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.abs(amount),
  );
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return unit ? `${sign}${formatted} ${unit}` : `${sign}${formatted}`;
}

function formatSignedPct(amount: number): string {
  const formatted = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(amount),
  );
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatted}%`;
}

function inferDeltaPct(current: number | null, delta: number): number | null {
  if (current === null) return null;
  const previous = current - delta;
  if (previous === 0) return null;
  return (delta / previous) * 100;
}

/** `206,40 zł (+25,20 zł, +13,9%)`. A zero delta is just the value. */
export function formatDiffLine(value: string, delta: number | string | null, deltaPct: number | null): string {
  if (delta === null) return value;
  const numeric = typeof delta === 'number' ? delta : signedAmount(delta);
  if (numeric === 0) return value;
  if (numeric === null) {
    return deltaPct === null ? `${value} (${delta})` : `${value} (${delta}, ${formatSignedPct(deltaPct)})`;
  }
  const parsed = parsePlAmount(value);
  const deltaText = formatSignedMoney(numeric, parsed?.unit ?? null);
  const pct = deltaPct ?? inferDeltaPct(parsed?.amount ?? null, numeric);
  return pct === null ? `${value} (${deltaText})` : `${value} (${deltaText}, ${formatSignedPct(pct)})`;
}

/** Header amount. A string total is shown as sent. PLN numbers use zł. */
export function formatExpenseTotal(total: number | string | null, currency: string | null): string | null {
  if (total === null) return null;
  if (typeof total === 'string') return total;
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);
  if (!currency || currency.toUpperCase() === 'PLN') return `${formatted} zł`;
  return `${formatted} ${currency}`;
}

export interface PointGroup {
  id: string;
  /** PrimeIcons name without the "pi-" prefix, for example "sun". */
  icon: string;
  label: string;
}

/** Legacy fallback: a " r" or " w" label suffix means morning (sun) or evening (moon). */
const SUFFIX_GROUPS: Record<string, PointGroup> = {
  r: { id: 'r', icon: 'sun', label: 'Rano' },
  w: { id: 'w', icon: 'moon', label: 'Wieczór' },
};

export function suffixGroupOf(label: string): PointGroup | null {
  const match = /\s([rw])$/i.exec(label.trim());
  return match ? SUFFIX_GROUPS[match[1].toLowerCase()] : null;
}

/** Reads one `groups` entry: `{ id, icon, label? }`. Anything else means no group. */
export function readPointGroup(raw: unknown): PointGroup | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id);
  const icon = text(row.icon)?.replace(/^pi-/, '');
  if (!id || !icon || !/^[a-z0-9-]+$/.test(icon)) return null;
  return { id, icon, label: text(row.label) ?? id };
}

export function groupKey(section: string): string {
  return `dashboard_groups_${section}`;
}

/** Distinct groups in order of first appearance. */
export function distinctGroups(lists: readonly (readonly (PointGroup | null)[])[]): PointGroup[] {
  const found = new Map<string, PointGroup>();
  for (const list of lists) {
    for (const group of list) if (group && !found.has(group.id)) found.set(group.id, group);
  }
  return [...found.values()];
}

/** Stored "a,b" selection limited to the groups on screen. Nothing usable means all of them. */
export function readGroupSelection(stored: string | null, available: readonly PointGroup[]): Set<string> {
  const ids = new Set(available.map((group) => group.id));
  const chosen = (stored ?? '').split(',').filter((id) => ids.has(id));
  return new Set(chosen.length > 0 ? chosen : ids);
}

/** Flips one group. The last one stays on. */
export function toggleGroupSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.has(id)) next.add(id);
  else if (next.size > 1) next.delete(id);
  return next;
}

/** Keeps only points whose group is selected. Points without a group always stay. */
export function filterBarsByGroup<
  T extends {
    labels: string[];
    groups: (PointGroup | null)[];
    series: ExpenseSeries[];
    lineSeries: ExpenseSeries[];
    highlight: number | null;
  },
>(block: T, selected: ReadonlySet<string>): T {
  if (selected.size === 0 || block.groups.every((group) => group === null)) return block;
  const keep = block.groups.map((group) => group === null || selected.has(group.id));
  if (keep.every(Boolean)) return block;
  const pick = <V,>(values: V[]) => values.filter((_, index) => keep[index]);
  const narrow = (series: ExpenseSeries) => ({ ...series, values: pick(series.values), tones: pick(series.tones) });
  const highlight =
    block.highlight !== null && keep[block.highlight] ? keep.slice(0, block.highlight).filter(Boolean).length : null;
  return {
    ...block,
    labels: pick(block.labels),
    groups: pick(block.groups),
    series: block.series.map(narrow),
    lineSeries: block.lineSeries.map(narrow),
    highlight,
  };
}

/** Shared vertical scale. All-non-negative data stays pinned at zero, as before. */
export function barScale(values: number[]): { signed: boolean; low: number; high: number } {
  const signed = values.some((value) => value < 0);
  const low = signed ? Math.min(0, ...values) : 0;
  const high = Math.max(0, ...values);
  if (high === low) return { signed, low: 0, high: 1 };
  return { signed, low, high };
}

/** Room, in percent of the plot, kept free for a value sitting on a signed bar end. */
export const SIGNED_VALUE_INSET = 12;

/** Plot Y in a 0–100 viewBox, top is `high`. Matches the old scale when `low` and `inset` are 0. */
export function plotY(value: number, low: number, high: number, inset = 0): number {
  const span = high - low || 1;
  const usable = 100 - inset * 2;
  return inset + ((high - value) / span) * usable;
}

function parsePlAmount(raw: string): { amount: number; unit: string | null } | null {
  const match = /^([+−-]?)\s*(\d{1,3}(?:[ \u00a0]\d{3})*|\d+)(?:,(\d+))?(?:\s+(.+))?$/.exec(raw.trim());
  if (!match) return null;
  const amount = Number(`${match[2].replace(/[ \u00a0]/g, '')}.${match[3] ?? '0'}`);
  if (!Number.isFinite(amount)) return null;
  const signed = match[1] === '-' || match[1] === '−' ? -amount : amount;
  return { amount: signed, unit: match[4] ?? null };
}

/** Rounds the number inside a donut center label. `1245,82 zł` with `0` becomes `1246 zł`. */
export function formatDonutCenter(raw: unknown, decimals: number | null): string | null {
  const digits = decimals === null ? null : Math.trunc(decimals);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: digits ?? 0,
      maximumFractionDigits: digits ?? 2,
    }).format(raw);
  }
  const label = text(raw);
  if (!label || digits === null) return label;
  const parsed = parsePlAmount(label);
  if (!parsed) return label;
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(parsed.amount);
  return parsed.unit ? `${formatted} ${parsed.unit}` : formatted;
}

export const EXPENSE_GOOD = '#7dcea0';
export const EXPENSE_BAD = '#e07a6a';

/** Negative bars are red. `sign_tone` also paints positives green. An explicit tone wins. */
export function barFillColor(
  value: number,
  seriesColor: string | null,
  seriesIndex: number,
  tone: ExpenseTone | null,
  signTone: boolean,
): string {
  if (tone === 'good') return EXPENSE_GOOD;
  if (tone === 'bad') return EXPENSE_BAD;
  if (value < 0) return EXPENSE_BAD;
  if (signTone && value > 0) return EXPENSE_GOOD;
  return expenseColor(seriesIndex, seriesColor);
}

/** Least-squares line through `values`, one point per index. Needs two points. */
export function linearTrend(values: number[]): number[] | null {
  const count = values.length;
  if (count < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let index = 0; index < count; index += 1) {
    sumX += index;
    sumY += values[index];
    sumXX += index * index;
    sumXY += index * values[index];
  }
  const denom = count * sumXX - sumX * sumX;
  if (denom === 0) return values.slice();
  const slope = (count * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / count;
  return values.map((_, index) => intercept + slope * index);
}

/** Bar label. Compact drops decimals once the amount is at least 100. */
export function formatBarValue(value: number, unit: string | null, compact: boolean): string {
  const maxDigits = compact && Math.abs(value) >= 100 ? 0 : Number.isInteger(value) ? 0 : compact ? 1 : 2;
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatShare(percent: number): string {
  const formatted = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(percent);
  return `${formatted}%`;
}

export function expenseColor(index: number, explicit: string | null): string {
  return explicit ?? PALETTE[index % PALETTE.length];
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Opłacone',
  unpaid: 'Nieopłacone',
  due: 'Do zapłaty',
};

export function expenseStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return STATUS_LABELS[status] ?? status;
}
