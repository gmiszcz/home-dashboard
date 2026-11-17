import type { SectionUpdate } from './types';

export interface ExpenseKpi {
  label: string;
  value: string;
  delta: string | null;
}

export interface ExpenseSeries {
  name: string | null;
  values: number[];
  color: string | null;
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
}

export type ExpenseBlock =
  | { type: 'kpi'; title: string | null; items: ExpenseKpi[] }
  | {
      type: 'bars';
      title: string | null;
      unit: string | null;
      labels: string[];
      highlight: number | null;
      series: ExpenseSeries[];
    }
  | { type: 'donut'; title: string | null; center: string | null; segments: ExpenseSegment[] }
  | { type: 'line'; title: string | null; labels: string[]; values: number[] }
  | { type: 'table'; title: string | null; columns: string[]; rows: string[][] }
  | { type: 'list'; title: string | null; items: ExpenseListItem[] }
  | { type: 'text'; title: string | null; text: string };

export interface ExpensesTileModel {
  period: string | null;
  total: number | string | null;
  currency: string | null;
  blocks: ExpenseBlock[];
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

function readKpi(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.items)) return null;
  const items: ExpenseKpi[] = [];
  for (const entry of block.items) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const label = text(row.label);
    const value = text(row.value) ?? (finite(row.value) !== null ? String(row.value) : null);
    if (!label || !value) continue;
    items.push({ label, value, delta: text(row.delta) });
  }
  if (items.length === 0) return null;
  return { type: 'kpi', title: titleOf(block), items };
}

function readBars(block: Record<string, unknown>): ExpenseBlock | null {
  if (!Array.isArray(block.labels) || !Array.isArray(block.series)) return null;
  const labels = block.labels.filter((label): label is string => typeof label === 'string' && label.trim() !== '');
  if (labels.length === 0) return null;
  const series: ExpenseSeries[] = [];
  for (const entry of block.series) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (!Array.isArray(row.values) || row.values.length !== labels.length) continue;
    const values = row.values.map((value) => finite(value));
    if (values.some((value) => value === null)) continue;
    series.push({
      name: text(row.name),
      values: values as number[],
      color: colorOf(row.color),
    });
  }
  if (series.length === 0) return null;
  const highlight = finite(block.highlight);
  return {
    type: 'bars',
    title: titleOf(block),
    unit: text(block.unit),
    labels,
    highlight: highlight !== null && highlight >= 0 && highlight < labels.length ? highlight : null,
    series,
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
  return { type: 'donut', title: titleOf(block), center: text(block.center), segments };
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
  const rows: string[][] = [];
  for (const entry of block.rows) {
    if (!Array.isArray(entry)) continue;
    rows.push(entry.map((cell) => cellText(cell) ?? ''));
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
    items.push({ label, amount, date: text(row.date), status: text(row.status)?.toLowerCase() ?? null });
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
    case 'donut':
      return readDonut(block);
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

export function readExpensesTile(update: SectionUpdate): ExpensesTileModel {
  const rawBlocks = update.blocks;
  const blocks = Array.isArray(rawBlocks)
    ? rawBlocks.map(readBlock).filter((block): block is ExpenseBlock => block !== null)
    : [];
  const totalValue = update.total;
  const total =
    typeof totalValue === 'number' && Number.isFinite(totalValue)
      ? totalValue
      : text(totalValue);
  return {
    period: text(update.period),
    total,
    currency: text(update.currency),
    blocks,
  };
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
