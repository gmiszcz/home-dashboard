import type { DashboardItem, SectionUpdate } from '../types';
import { asNumber, asRecord, asString } from './parse';

/** Groups that are part of the pay split, not earnings or notes. */
const ALLOCATION_SKIP = new Set(['addition', 'earning', 'info']);
const BAR_SKIP = new Set(['earning', 'info']);

const LINE_COLORS: Record<string, string> = {
  net: '#7dcea0',
  pit: '#e07a5f',
  emerytalna: '#e2a53a',
  rentowa: '#f2cc8f',
  chorobowa: '#e9c46a',
  zus: '#e2a53a',
  zdrowotna: '#7eb6d6',
  ppk: '#c4b5fd',
  zfss: '#81b29a',
  medicover: '#b7b1a6',
  other: '#8e9aaf',
  premia: '#48cae4',
  home_office: '#90e0ef',
  addition: '#48cae4',
};

const PALETTE = ['#e2a53a', '#7dcea0', '#7eb6d6', '#e07a5f', '#c4b5fd', '#f2cc8f', '#81b29a', '#e9c46a'];

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

export const DIFF_FIELDS: { key: string; label: string }[] = [
  { key: 'gross', label: 'Brutto' },
  { key: 'net', label: 'Na konto' },
  { key: 'pit', label: 'PIT' },
  { key: 'emerytalna', label: 'Emerytalna' },
  { key: 'rentowa', label: 'Rentowa' },
  { key: 'chorobowa', label: 'Chorobowa' },
  { key: 'zdrowotna', label: 'Zdrowotna' },
  { key: 'ppk', label: 'PPK' },
  { key: 'zfss', label: 'ZFŚS' },
  { key: 'other', label: 'Inne potrącenia' },
  { key: 'deductions_total', label: 'Potrącenia' },
  { key: 'additions_total', label: 'Dodatki' },
  { key: 'premia', label: 'Premia' },
  { key: 'home_office', label: 'Home office' },
];

export interface PayslipLine {
  code: string;
  label: string;
  group: string;
  amount: number;
  color: string;
}

export interface PayslipPeriod {
  month: string | null;
  gross: number | null;
  net: number | null;
  deductionsTotal: number | null;
  additionsTotal: number | null;
  ytdIncome: number | null;
  employer: string | null;
  employmentRate: number | null;
  hoursNominal: number | null;
  hoursLeave: number | null;
  homeOfficeDays: number | null;
  pitRate: number | null;
  lines: PayslipLine[];
  items: DashboardItem[];
}

export interface PayslipHistoryPoint {
  month: string;
  label: string;
  gross: number | null;
  net: number | null;
}

export interface PayslipDiff {
  key: string;
  label: string;
  diff: number;
}

export interface PayslipModel {
  currency: string;
  chart: boolean;
  current: PayslipPeriod;
  previous: PayslipPeriod | null;
  history: PayslipHistoryPoint[];
  diffs: PayslipDiff[];
}

export type PayslipChartMode = 'donut' | 'bar';

function lineColor(code: string, group: string, index: number): string {
  return LINE_COLORS[code] ?? LINE_COLORS[group] ?? PALETTE[index % PALETTE.length];
}

function readLines(value: unknown): PayslipLine[] {
  if (!Array.isArray(value)) return [];
  const lines: PayslipLine[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const label = asString(row.label);
    const amount = asNumber(row.amount);
    if (!label || amount === null) continue;
    const code = asString(row.code) ?? label;
    const group = asString(row.group) ?? 'other';
    lines.push({ code, label, group, amount, color: '' });
  }
  return lines.map((line, index) => ({ ...line, color: lineColor(line.code, line.group, index) }));
}

/** "2026-10" → "paź 2026". Anything else is returned unchanged. */
export function monthLabel(month: string | null): string {
  if (!month) return '';
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const name = MONTHS[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : month;
}

function amountByCode(lines: PayslipLine[], code: string): number | null {
  const found = lines.find((line) => line.code === code);
  return found ? found.amount : null;
}

function readPeriod(source: Record<string, unknown>, items: DashboardItem[]): PayslipPeriod {
  let lines = readLines(source.components);
  if (lines.length === 0) {
    lines = readLines(source.deductions);
    const net = asNumber(source.net);
    if (net !== null) {
      lines = [{ code: 'net', label: 'Na konto', group: 'net', amount: net, color: '' }, ...lines];
      lines = lines.map((line, index) => ({ ...line, color: lineColor(line.code, line.group, index) }));
    }
  }
  return {
    month: asString(source.month),
    gross: asNumber(source.gross),
    net: asNumber(source.net),
    deductionsTotal: asNumber(source.deductions_total),
    additionsTotal: asNumber(source.additions_total),
    ytdIncome: asNumber(source.ytd_income),
    employer: asString(source.employer),
    employmentRate: asNumber(source.employment_rate),
    hoursNominal: asNumber(source.hours_nominal),
    hoursLeave: asNumber(source.hours_leave),
    homeOfficeDays: asNumber(source.home_office_days),
    pitRate: asNumber(source.pit_rate),
    lines,
    items,
  };
}

function readItems(value: unknown): DashboardItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DashboardItem => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function metric(period: PayslipPeriod, key: string): number | null {
  if (key === 'gross') return period.gross;
  if (key === 'net') return period.net;
  if (key === 'deductions_total') return period.deductionsTotal;
  if (key === 'additions_total') return period.additionsTotal;
  return amountByCode(period.lines, key);
}

function readDiffs(
  current: PayslipPeriod,
  previous: PayslipPeriod | null,
  explicit: unknown,
): PayslipDiff[] {
  const record = asRecord(explicit);
  const numeric = asNumber(explicit);
  if (!record && numeric === null && !previous) return [];

  const keys = DIFF_FIELDS.map((field) => field.key);
  if (record) {
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  const diffs: PayslipDiff[] = [];
  for (const key of keys) {
    const label = DIFF_FIELDS.find((field) => field.key === key)?.label ?? key;
    const stated = record ? asNumber(record[key]) : null;
    if (stated !== null) {
      diffs.push({ key, label, diff: stated });
      continue;
    }
    if (key === 'net' && numeric !== null && !record) {
      diffs.push({ key, label, diff: numeric });
      continue;
    }
    const now = metric(current, key);
    const before = previous ? metric(previous, key) : null;
    if (now === null || before === null) continue;
    diffs.push({ key, label, diff: Math.round((now - before) * 100) / 100 });
  }
  return diffs;
}

function readHistory(value: unknown): PayslipHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  const points: PayslipHistoryPoint[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const month = asString(row.month);
    if (!month) continue;
    points.push({
      month,
      label: monthLabel(month),
      gross: asNumber(row.gross),
      net: asNumber(row.net),
    });
  }
  return points;
}

export function readPayslip(update: SectionUpdate): PayslipModel {
  const extra = update.extra ?? {};
  const current = readPeriod(extra, update.items);
  const previousSource = asRecord(extra.previous_month);
  const previous = previousSource ? readPeriod(previousSource, readItems(previousSource.items)) : null;
  const history = readHistory(extra.history);
  const chart = current.lines.length > 0 || (previous?.lines.length ?? 0) > 0 || history.length > 0;
  return {
    currency: asString(extra.currency) ?? 'PLN',
    chart,
    current,
    previous,
    history,
    diffs: readDiffs(current, previous, extra.diff_vs_previous),
  };
}

/** Donut shows the split of the payout. The bar adds premia and home office on top. */
export function chartLines(lines: PayslipLine[], mode: PayslipChartMode): PayslipLine[] {
  const skip = mode === 'donut' ? ALLOCATION_SKIP : BAR_SKIP;
  return lines.filter((line) => line.amount !== 0 && !skip.has(line.group));
}

export function linesTotal(lines: PayslipLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
}

/** Share of gross when gross is known, otherwise share of the lines on screen. */
export function percentBase(gross: number | null, lines: PayslipLine[]): number {
  if (gross !== null && gross > 0) return gross;
  return linesTotal(lines);
}

export function formatShare(amount: number, whole: number): string {
  if (!whole) return '0%';
  return `${((amount / whole) * 100).toFixed(1).replace('.', ',')}%`;
}

export function itemsForLine(items: DashboardItem[], line: PayslipLine): DashboardItem[] {
  return items.filter((item) => {
    const code = asString(item.code);
    const name = asString(item.name) ?? asString(item.title);
    return code === line.code || name === line.label;
  });
}
