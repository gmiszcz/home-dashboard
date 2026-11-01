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

export interface ReceiptLine {
  name: string;
  qty?: number;
  unit?: string;
  unit_price?: number;
  amount: number;
  discount?: number;
}

export interface ReceiptBreakdown {
  subcategory: string;
  label: string;
  category?: string;
  amount: number;
  count?: number;
  lines?: ReceiptLine[];
}

export interface ReceiptData {
  source?: string;
  receipt_id?: string;
  time?: string;
  store?: string;
  total?: number;
  matched?: boolean;
  discounts_total?: number;
  breakdown?: ReceiptBreakdown[];
}

export interface DetailedSubcategory {
  subcategory: string;
  label: string;
  amount: number;
}

export interface DetailedCategory {
  category: string;
  amount: number;
  with_receipt?: number;
  without_receipt?: number;
  subcategories: DetailedSubcategory[];
}

export interface ReceiptsSummary {
  count: number;
  covered_amount: number;
}

export interface SubcategoryMeta {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const SUBCATEGORIES: Record<string, SubcategoryMeta> = {
  nabial: { id: 'nabial', label: 'Nabiał', icon: '🧀', color: '#ffd166' },
  mieso: { id: 'mieso', label: 'Mięso i wędliny', icon: '🥩', color: '#ef476f' },
  ryby: { id: 'ryby', label: 'Ryby', icon: '🐟', color: '#118ab2' },
  pieczywo: { id: 'pieczywo', label: 'Pieczywo', icon: '🥖', color: '#e09f3e' },
  warzywa_owoce: { id: 'warzywa_owoce', label: 'Warzywa i owoce', icon: '🥦', color: '#06d6a0' },
  suche: { id: 'suche', label: 'Makarony, kasze i mąka', icon: '🌾', color: '#d4a373' },
  mrozonki: { id: 'mrozonki', label: 'Mrożonki', icon: '❄️', color: '#a0c4ff' },
  slodycze: { id: 'slodycze', label: 'Słodycze i przekąski', icon: '🍫', color: '#ff99c8' },
  napoje: { id: 'napoje', label: 'Napoje', icon: '🧃', color: '#48cae4' },
  alkohol: { id: 'alkohol', label: 'Alkohol', icon: '🍷', color: '#9d4edd' },
  dziecko: { id: 'dziecko', label: 'Dziecko', icon: '👶', color: '#f4a261' },
  chemia: { id: 'chemia', label: 'Chemia i higiena', icon: '🧴', color: '#2ec4b6' },
  dom: { id: 'dom', label: 'Dom', icon: '🏠', color: '#70a9a1' },
  kaucja: { id: 'kaucja', label: 'Kaucja i opakowania', icon: '♻️', color: '#52b788' },
  _bez_paragonu: { id: '_bez_paragonu', label: 'Bez paragonu', icon: '🧾', color: '#6c757d' },
  inne: { id: 'inne', label: 'Inne', icon: '📦', color: '#adb5bd' },
};

export function subcategoryMeta(sub: string, customLabel?: string): SubcategoryMeta {
  const meta = SUBCATEGORIES[sub];
  if (meta) {
    return customLabel ? { ...meta, label: customLabel } : meta;
  }
  return {
    id: sub,
    label: customLabel || sub,
    icon: '📦',
    color: '#8e9aaf',
  };
}

export interface ExpenseWeek {
  total: number | null;
  byCategory: CategorySlice[];
  byDay: DayBar[];
  byCategoryDetailed: DetailedCategory[];
  detailedSlices: CategorySlice[];
  receipts: ReceiptsSummary | null;
  hasReceipts: boolean;
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

export function readReceipt(source: unknown): ReceiptData | null {
  const row = asRecord(source);
  if (!row) return null;
  const breakdownRaw = Array.isArray(row.breakdown) ? row.breakdown : [];
  const breakdown: ReceiptBreakdown[] = [];
  for (const b of breakdownRaw) {
    const bRow = asRecord(b);
    if (!bRow) continue;
    const subcategory = asString(bRow.subcategory) ?? 'inne';
    const label = asString(bRow.label) ?? subcategoryMeta(subcategory).label;
    const amount = asNumber(bRow.amount) ?? 0;
    const linesRaw = Array.isArray(bRow.lines) ? bRow.lines : [];
    const lines: ReceiptLine[] = [];
    for (const l of linesRaw) {
      const lRow = asRecord(l);
      if (!lRow) continue;
      const name = asString(lRow.name) ?? 'Produkt';
      const lAmount = asNumber(lRow.amount) ?? 0;
      lines.push({
        name,
        qty: asNumber(lRow.qty) ?? undefined,
        unit: asString(lRow.unit) ?? undefined,
        unit_price: asNumber(lRow.unit_price) ?? undefined,
        amount: lAmount,
        discount: asNumber(lRow.discount) ?? undefined,
      });
    }
    breakdown.push({
      subcategory,
      label,
      category: asString(bRow.category) ?? undefined,
      amount,
      count: asNumber(bRow.count) ?? (lines.length > 0 ? lines.length : undefined),
      lines,
    });
  }

  return {
    source: asString(row.source) ?? undefined,
    receipt_id: asString(row.receipt_id) ?? undefined,
    time: asString(row.time) ?? undefined,
    store: asString(row.store) ?? undefined,
    total: asNumber(row.total) ?? undefined,
    matched: typeof row.matched === 'boolean' ? row.matched : true,
    discounts_total: asNumber(row.discounts_total) ?? undefined,
    breakdown,
  };
}

export function readDetailedCategories(value: unknown): DetailedCategory[] {
  if (!Array.isArray(value)) return [];
  const list: DetailedCategory[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const category = asString(row.category);
    const amount = asNumber(row.amount);
    if (!category || amount === null) continue;
    const subList: DetailedSubcategory[] = [];
    if (Array.isArray(row.subcategories)) {
      for (const sub of row.subcategories) {
        const sRow = asRecord(sub);
        if (!sRow) continue;
        const subcategory = asString(sRow.subcategory) ?? 'inne';
        const label = asString(sRow.label) ?? subcategoryMeta(subcategory).label;
        const sAmount = asNumber(sRow.amount);
        if (sAmount === null) continue;
        subList.push({ subcategory, label, amount: sAmount });
      }
    }
    list.push({
      category,
      amount,
      with_receipt: asNumber(row.with_receipt) ?? undefined,
      without_receipt: asNumber(row.without_receipt) ?? undefined,
      subcategories: subList,
    });
  }
  return list;
}

export function buildDetailedSlices(
  byCategory: CategorySlice[],
  byCategoryDetailed: DetailedCategory[],
  items: DashboardItem[],
): CategorySlice[] {
  if (byCategoryDetailed.length > 0) {
    const detailedMap = new Map(byCategoryDetailed.map((c) => [c.category, c]));
    const slices: CategorySlice[] = [];
    for (const main of byCategory) {
      const detailed = detailedMap.get(main.category);
      if (detailed && detailed.subcategories.length > 0) {
        for (const sub of detailed.subcategories) {
          const meta = subcategoryMeta(sub.subcategory, sub.label);
          slices.push({
            category: sub.label,
            amount: sub.amount,
            color: meta.color,
          });
        }
      } else {
        slices.push(main);
      }
    }
    return slices.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
  }

  const itemsWithReceipt = items.filter((i) => Boolean(i.receipt));
  if (itemsWithReceipt.length === 0) return byCategory;

  const subTotals = new Map<string, { label: string; amount: number }>();
  let receiptTotal = 0;
  for (const item of itemsWithReceipt) {
    const r = readReceipt(item.receipt);
    if (!r?.breakdown) continue;
    for (const b of r.breakdown) {
      const current = subTotals.get(b.subcategory) ?? { label: b.label, amount: 0 };
      current.amount = Math.round((current.amount + b.amount) * 100) / 100;
      subTotals.set(b.subcategory, current);
      receiptTotal += b.amount;
    }
  }

  const slices: CategorySlice[] = [];
  subTotals.forEach((val, sub) => {
    slices.push({
      category: val.label,
      amount: val.amount,
      color: subcategoryMeta(sub, val.label).color,
    });
  });

  const totalAll = byCategory.reduce((sum, c) => sum + c.amount, 0);
  const withoutReceipt = Math.round((totalAll - receiptTotal) * 100) / 100;
  if (withoutReceipt > 0) {
    slices.push({
      category: 'Bez paragonu',
      amount: withoutReceipt,
      color: SUBCATEGORIES._bez_paragonu.color,
    });
  }

  return slices.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
}

function readWeek(source: Record<string, unknown>, items: DashboardItem[]): ExpenseWeek {
  const byCategory = readCategories(source.by_category);
  const explicit = asNumber(source.total);
  const byCategoryDetailed = readDetailedCategories(source.by_category_detailed);
  const receiptsRaw = asRecord(source.receipts);
  const receipts: ReceiptsSummary | null = receiptsRaw
    ? {
        count: asNumber(receiptsRaw.count) ?? 0,
        covered_amount: asNumber(receiptsRaw.covered_amount) ?? 0,
      }
    : null;
  const detailedSlices = buildDetailedSlices(byCategory, byCategoryDetailed, items);
  const hasReceipts =
    receipts !== null ||
    byCategoryDetailed.length > 0 ||
    items.some((i) => Boolean(i.receipt));

  return {
    total: explicit ?? sumCategories(byCategory),
    byCategory,
    byDay: readDays(source.by_day),
    byCategoryDetailed,
    detailedSlices,
    receipts,
    hasReceipts,
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

export function itemsForCategoryOrSubcategory(items: DashboardItem[], name: string): DashboardItem[] {
  return items.filter((item) => {
    if (asString(item.category) === name) return true;
    if (item.receipt) {
      const r = readReceipt(item.receipt);
      if (r?.breakdown?.some((b) => b.label === name || b.subcategory === name)) {
        return true;
      }
    }
    return false;
  });
}

export function itemsForDay(items: DashboardItem[], date: string): DashboardItem[] {
  if (!date) return [];
  return items.filter((item) => {
    const value = asString(item.date);
    return value ? value.slice(0, 10) === date : false;
  });
}
