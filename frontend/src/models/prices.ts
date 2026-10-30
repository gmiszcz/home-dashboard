import { addDaysKey, dateKeyFromField, warsawDateKey } from '../format';
import type { DashboardItem, SectionUpdate } from '../types';
import { asNumber, asRecord, asString } from './parse';

export const SPARKLINE_DAYS = 30;

export interface PricePoint {
  date: string;
  price: number;
  store: string | null;
}

export function historyFor(update: SectionUpdate, item: DashboardItem, now: Date): PricePoint[] {
  const history = asRecord(update.extra?.history);
  if (!history) return [];
  const keys = [asString(item.product), asString(item.title), asString(item.id)].filter(
    (key): key is string => Boolean(key),
  );
  let rows: unknown;
  for (const key of keys) {
    if (key in history) {
      rows = history[key];
      break;
    }
  }
  if (!Array.isArray(rows)) return [];
  const today = warsawDateKey(now);
  const from = addDaysKey(today, -(SPARKLINE_DAYS - 1));
  const points: PricePoint[] = [];
  for (const entry of rows) {
    const row = asRecord(entry);
    if (!row) continue;
    const rawDate = asString(row.date);
    const price = asNumber(row.price);
    if (!rawDate || price === null) continue;
    const date = dateKeyFromField(rawDate);
    if (!date || date < from || date > today) continue;
    points.push({ date, price, store: asString(row.store) });
  }
  points.sort((left, right) => left.date.localeCompare(right.date));
  return points;
}
