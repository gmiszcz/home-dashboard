import type { SectionUpdate } from '../types';
import { asNumber, asRecord, asString } from './parse';
import { monthLabel } from './payslip';

export const ENERGY_SALES = 'Sprzedaż energii';
export const ENERGY_DISTRIBUTION = 'Dystrybucja';
export const ENERGY_OTHER = 'Pozostałe';

export const ENERGY_SALES_COLOR = '#e2a53a';
export const ENERGY_DISTRIBUTION_COLOR = '#7dcea0';
export const ENERGY_OTHER_COLOR = '#b7b1a6';

/** Marker shown on estimated monthly figures. The split follows calendar days, not a meter reading. */
export const ESTIMATE_NOTE = 'szacunek';

export interface EnergyInvoice {
  number: string;
  kind: string;
  issued: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  kwh: number | null;
  sales: number | null;
  distribution: number | null;
  total: number | null;
  due: string | null;
  averagePerKwh: number | null;
  status: string | null;
  sourceFile: string | null;
  note: string | null;
}

export interface EnergyMonth {
  key: string;
  label: string;
  days: number;
  kwh: number;
  sales: number;
  distribution: number;
  total: number;
}

export interface EnergyComposition {
  sales: number;
  distribution: number;
  total: number;
  kwh: number;
}

export interface EnergyPricePoint {
  number: string;
  label: string;
  price: number;
}

export interface EnergyModel {
  structured: boolean;
  currency: string;
  invoices: EnergyInvoice[];
  usage: EnergyInvoice[];
  months: EnergyMonth[];
  year: EnergyComposition;
  prices: EnergyPricePoint[];
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** UTC midnight for a real calendar day, or null when the text is not YYYY-MM-DD. */
export function utcDay(iso: string): number | null {
  const match = DATE_RE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return time;
}

/** Inclusive day counts per calendar month between two dates. */
export function monthSpans(from: string, to: string): { key: string; days: number }[] {
  const start = utcDay(from);
  const end = utcDay(to);
  if (start === null || end === null || end < start) return [];
  const spans: { key: string; days: number }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const date = new Date(cursor);
    const monthEnd = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
    const sliceEnd = Math.min(monthEnd, end);
    const days = Math.round((sliceEnd - cursor) / 86_400_000) + 1;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    spans.push({ key, days });
    cursor = sliceEnd + 86_400_000;
  }
  return spans;
}

/**
 * Splits `total` across `weights` so the rounded parts add back up to the rounded total.
 * The leftover hundredths (or other units) go to the largest fractional parts.
 */
export function splitProportional(total: number, weights: number[], decimals = 2): number[] {
  if (weights.length === 0) return [];
  const factor = 10 ** decimals;
  const units = Math.round(total * factor);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0 || !Number.isFinite(units)) return weights.map(() => 0);
  const raw = weights.map((weight) => (units * weight) / weightSum);
  const floors = raw.map((value) => Math.floor(value));
  const leftover = units - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((left, right) => right.frac - left.frac || left.index - right.index);
  for (let step = 0; step < leftover; step += 1) floors[order[step].index] += 1;
  return floors.map((value) => value / factor);
}

export function shortMonth(monthKey: string): string {
  const label = monthLabel(monthKey);
  const parts = label.split(' ');
  if (parts.length !== 2 || parts[1].length < 4) return label;
  return `${parts[0]} ${parts[1].slice(2)}`;
}

export function polishDate(iso: string | null): string | null {
  if (!iso) return null;
  const match = DATE_RE.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])}.${match[2]}.${match[1]}`;
}

export function shortPeriod(from: string | null, to: string | null): string {
  const start = from ? shortMonth(from.slice(0, 7)) : '';
  const end = to ? shortMonth(to.slice(0, 7)) : '';
  if (start && end) return start === end ? start : `${start}–${end}`;
  return start || end || polishDate(from) || polishDate(to) || 'faktura';
}

/** Billing invoices with usage. Corrections, notes and other documents stay off the charts. */
export function isUsageInvoice(invoice: EnergyInvoice): boolean {
  return invoice.kind === 'invoice' && invoice.kwh !== null && invoice.kwh > 0 && invoice.total !== null;
}

/** Gross total per kWh for one invoice period. Null when usage is missing. */
export function pricePerKwh(invoice: EnergyInvoice): number | null {
  if (!isUsageInvoice(invoice) || invoice.kwh === null || invoice.kwh <= 0 || invoice.total === null) return null;
  return round2(invoice.total / invoice.kwh);
}

export function sumUsage(invoices: EnergyInvoice[]): EnergyComposition {
  const usage = invoices.filter(isUsageInvoice);
  return {
    sales: round2(usage.reduce((sum, invoice) => sum + (invoice.sales ?? 0), 0)),
    distribution: round2(usage.reduce((sum, invoice) => sum + (invoice.distribution ?? 0), 0)),
    total: round2(usage.reduce((sum, invoice) => sum + (invoice.total ?? 0), 0)),
    kwh: round2(usage.reduce((sum, invoice) => sum + (invoice.kwh ?? 0), 0)),
  };
}

export function compositionSlices(part: EnergyComposition): { category: string; amount: number; color: string }[] {
  const slices = [
    { category: ENERGY_SALES, amount: part.sales, color: ENERGY_SALES_COLOR },
    { category: ENERGY_DISTRIBUTION, amount: part.distribution, color: ENERGY_DISTRIBUTION_COLOR },
  ];
  const remainder = round2(part.total - part.sales - part.distribution);
  if (remainder > 0.05) slices.push({ category: ENERGY_OTHER, amount: remainder, color: ENERGY_OTHER_COLOR });
  return slices.filter((slice) => slice.amount > 0);
}

export function shareWhole(part: EnergyComposition): number {
  if (part.total > 0) return part.total;
  const sum = part.sales + part.distribution;
  return sum > 0 ? sum : 0;
}

function readInvoice(value: unknown): EnergyInvoice | null {
  const row = asRecord(value);
  if (!row) return null;
  const number = asString(row.number);
  if (!number) return null;
  return {
    number,
    kind: asString(row.kind) ?? 'other',
    issued: asString(row.issued),
    periodFrom: asString(row.period_from),
    periodTo: asString(row.period_to),
    kwh: asNumber(row.kwh),
    sales: asNumber(row.sales),
    distribution: asNumber(row.distribution),
    total: asNumber(row.total),
    due: asString(row.due),
    averagePerKwh: asNumber(row.average_per_kwh),
    status: asString(row.status),
    sourceFile: asString(row.source_file),
    note: asString(row.note),
  };
}

function invoiceOrder(invoice: EnergyInvoice): string {
  return invoice.periodTo ?? invoice.issued ?? invoice.periodFrom ?? invoice.number;
}

/** How many structured invoices the payload carries. Zero when the tile should stay a generic list. */
export function energyInvoiceCount(update: SectionUpdate): number {
  const data = asRecord(update.data);
  return Array.isArray(data?.invoices) ? data.invoices.length : 0;
}

export function monthlyEstimates(invoices: EnergyInvoice[]): EnergyMonth[] {
  const map = new Map<string, EnergyMonth>();
  const add = (key: string, days: number, kwh: number, sales: number, distribution: number, total: number) => {
    const existing = map.get(key) ?? {
      key,
      label: shortMonth(key),
      days: 0,
      kwh: 0,
      sales: 0,
      distribution: 0,
      total: 0,
    };
    existing.days += days;
    existing.kwh = round2(existing.kwh + kwh);
    existing.sales = round2(existing.sales + sales);
    existing.distribution = round2(existing.distribution + distribution);
    existing.total = round2(existing.total + total);
    map.set(key, existing);
  };

  for (const invoice of invoices) {
    if (!isUsageInvoice(invoice)) continue;
    const spans =
      invoice.periodFrom && invoice.periodTo ? monthSpans(invoice.periodFrom, invoice.periodTo) : [];
    if (spans.length === 0) {
      const anchor = invoice.periodTo ?? invoice.issued ?? invoice.periodFrom;
      const key = anchor ? anchor.slice(0, 7) : '';
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      add(key, 0, invoice.kwh ?? 0, invoice.sales ?? 0, invoice.distribution ?? 0, invoice.total ?? 0);
      continue;
    }
    const weights = spans.map((span) => span.days);
    const kwh = splitProportional(invoice.kwh ?? 0, weights);
    const sales = splitProportional(invoice.sales ?? 0, weights);
    const distribution = splitProportional(invoice.distribution ?? 0, weights);
    const total = splitProportional(invoice.total ?? 0, weights);
    spans.forEach((span, index) => add(span.key, span.days, kwh[index], sales[index], distribution[index], total[index]));
  }

  return [...map.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function readEnergy(update: SectionUpdate): EnergyModel {
  const data = asRecord(update.data);
  const rawInvoices = data && Array.isArray(data.invoices) ? data.invoices : null;
  const structured = rawInvoices !== null;
  const invoices = (rawInvoices ?? [])
    .map(readInvoice)
    .filter((invoice): invoice is EnergyInvoice => invoice !== null)
    .sort((left, right) => invoiceOrder(right).localeCompare(invoiceOrder(left)));
  const usage = [...invoices].filter(isUsageInvoice).sort((left, right) => invoiceOrder(left).localeCompare(invoiceOrder(right)));
  const prices: EnergyPricePoint[] = [];
  for (const invoice of usage) {
    const price = pricePerKwh(invoice);
    if (price === null) continue;
    prices.push({ number: invoice.number, label: shortPeriod(invoice.periodFrom, invoice.periodTo), price });
  }
  return {
    structured,
    currency: asString(data?.currency) ?? asString(update.extra?.currency) ?? 'PLN',
    invoices,
    usage,
    months: monthlyEstimates(usage),
    year: sumUsage(usage),
    prices,
  };
}

export function formatKwh(value: number): string {
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value)} kWh`;
}

export function formatUnitPrice(value: number): string {
  return `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} zł/kWh`;
}
