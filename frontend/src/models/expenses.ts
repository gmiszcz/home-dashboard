import { formatMoney } from '../format';
import type { DashboardItem, SectionUpdate } from '../types';
import { categoryColor } from './charts';
import { asNumber, asRecord, asString } from './parse';

export const WEEKDAY_LABELS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] as const;

export interface CategorySlice {
  category: string;
  amount: number;
  color: string;
}

export interface DayBar {
  date: string;
  label: string;
  amount: number;
}

export interface ExpenseWeek {
  total: number | null;
  byCategory: CategorySlice[];
  byDay: DayBar[];
  items: DashboardItem[];
  weekFrom: string | null;
  weekTo: string | null;
  week: string | null;
}

export interface ExpenseModel {
  currency: string;
  chart: boolean;
  current: ExpenseWeek;
  previous: ExpenseWeek | null;
  diff: number | null;
  dataUntil: string | null;
}

function readItems(value: unknown): DashboardItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DashboardItem => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function readCategories(value: unknown): CategorySlice[] {
  if (!Array.isArray(value)) return [];
  const slices: CategorySlice[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const category = asString(row.category);
    const amount = asNumber(row.amount);
    if (!category || amount === null) continue;
    slices.push({ category, amount, color: '' });
  }
  return slices.map((slice, index) => ({ ...slice, color: categoryColor(slice.category, index) }));
}

function readDays(value: unknown): DayBar[] {
  if (!Array.isArray(value)) return [];
  const parsed: DayBar[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const label = asString(row.label);
    const amount = asNumber(row.amount);
    if (!label || amount === null) continue;
    parsed.push({ date: asString(row.date) ?? '', label, amount });
  }
  const known = parsed.some((day) => (WEEKDAY_LABELS as readonly string[]).includes(day.label));
  if (!known) return parsed;
  const byLabel = new Map(parsed.map((day) => [day.label, day]));
  return WEEKDAY_LABELS.map(
    (label) => byLabel.get(label) ?? { date: '', label, amount: 0 },
  );
}

function sumCategories(slices: CategorySlice[]): number | null {
  if (slices.length === 0) return null;
  return Math.round(slices.reduce((sum, slice) => sum + slice.amount, 0) * 100) / 100;
}

function readWeek(source: Record<string, unknown>, items: DashboardItem[]): ExpenseWeek {
  const byCategory = readCategories(source.by_category);
  const explicit = asNumber(source.total);
  return {
    total: explicit ?? sumCategories(byCategory),
    byCategory,
    byDay: readDays(source.by_day),
    items,
    weekFrom: asString(source.week_from),
    weekTo: asString(source.week_to),
    week: asString(source.week),
  };
}

export function readExpenses(update: SectionUpdate): ExpenseModel {
  const extra = update.extra ?? {};
  const currency = asString(extra.currency) ?? 'PLN';
  const current = readWeek(extra, update.items);
  const previousSource = asRecord(extra.previous_week);
  const previous = previousSource ? readWeek(previousSource, readItems(previousSource.items)) : null;
  const explicitDiff = asNumber(extra.diff_vs_previous);
  let diff = explicitDiff;
  if (diff === null && previous && current.total !== null && previous.total !== null) {
    diff = Math.round((current.total - previous.total) * 100) / 100;
  }
  if (!previous && explicitDiff === null) diff = null;
  const chart =
    current.byCategory.length > 0 ||
    current.byDay.length > 0 ||
    (previous?.byCategory.length ?? 0) > 0 ||
    (previous?.byDay.length ?? 0) > 0;
  return {
    currency,
    chart,
    current,
    previous,
    diff,
    dataUntil: asString(extra.data_until),
  };
}

export type WeekKey = 'current' | 'previous';

/** Flips between the current and the previous week. Stays on the current week without previous data. */
export function toggleWeek(key: WeekKey, hasPrevious: boolean): WeekKey {
  if (key === 'previous') return 'current';
  return hasPrevious ? 'previous' : 'current';
}

/** Header button label. It names the period that is shown now. */
export function weekToggleLabel(key: WeekKey): string {
  return key === 'previous' ? 'Poprzedni' : 'Bieżący';
}

/**
 * Summary line button label. It names the view the click switches to.
 * A drill-down is a list, so there the button leads back to the chart.
 */
export function viewToggleLabel(view: { isList: boolean; isDrilled: boolean }): string {
  return view.isList || view.isDrilled ? 'Wykres' : 'Lista';
}

/**
 * The tile "show more" button grows the visible `items` only.
 * It is useful in the plain list and in the drill-down lists of the current week.
 * Charts and the previous week come from `extra`, so there it does nothing.
 */
export function canExpandItems(view: { isList: boolean; isDrilled: boolean; weekKey: WeekKey }): boolean {
  return view.weekKey === 'current' && (view.isList || view.isDrilled);
}

export function formatWeekDiff(diff: number, currency: string): string {
  const body = formatMoney(Math.abs(diff), currency);
  if (diff > 0) return `+${body} vs poprzedni tydzień`;
  if (diff < 0) return `−${body} vs poprzedni tydzień`;
  return `${body} vs poprzedni tydzień`;
}

export function itemsForCategory(items: DashboardItem[], category: string): DashboardItem[] {
  return items.filter((item) => asString(item.category) === category);
}

export function itemsForDay(items: DashboardItem[], date: string): DashboardItem[] {
  if (!date) return [];
  return items.filter((item) => {
    const value = asString(item.date);
    return value ? value.slice(0, 10) === date : false;
  });
}
