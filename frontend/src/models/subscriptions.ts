import { dateKeyFromField, daysUntil } from '../format';
import type { DashboardItem, SectionUpdate } from '../types';
import { asNumber, asRecord, asString } from './parse';

export const CHARGE_WINDOW_DAYS = 30;
export const CHARGE_SOON_DAYS = 3;

export interface Charge {
  date: string;
  name: string;
  amount: number | null;
  days: number;
  soon: boolean;
}

export interface SubscriptionModel {
  currency: string;
  total: number | null;
  period: string | null;
  charges: Charge[];
  /** Timeline when the bot sent next_30_days or items carry a charge inside the window. */
  timeline: boolean;
}

function chargeFrom(date: string, name: string, amount: number | null, now: Date): Charge | null {
  const key = dateKeyFromField(date);
  if (!key || !name) return null;
  const days = daysUntil(key, now);
  if (days === null || days < 0 || days > CHARGE_WINDOW_DAYS) return null;
  return { date: key, name, amount, days, soon: days <= CHARGE_SOON_DAYS };
}

function fromExtra(value: unknown, now: Date): Charge[] {
  if (!Array.isArray(value)) return [];
  const charges: Charge[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const date = asString(row.date);
    const name = asString(row.name);
    if (!date || !name) continue;
    const charge = chargeFrom(date, name, asNumber(row.amount), now);
    if (charge) charges.push(charge);
  }
  return charges;
}

function fromItems(items: DashboardItem[], now: Date): Charge[] {
  const charges: Charge[] = [];
  for (const item of items) {
    const date = asString(item.next_charge);
    const name = asString(item.name) ?? asString(item.title);
    if (!date || !name) continue;
    const charge = chargeFrom(date, name, asNumber(item.amount), now);
    if (charge) charges.push(charge);
  }
  return charges;
}

export function readSubscriptions(update: SectionUpdate, now: Date): SubscriptionModel {
  const extra = update.extra ?? {};
  const sent = extra.next_30_days;
  const fromBot = Array.isArray(sent) ? fromExtra(sent, now) : [];
  const charges = (fromBot.length > 0 ? fromBot : fromItems(update.items, now)).sort(
    (left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name, 'pl'),
  );
  return {
    currency: asString(extra.currency) ?? 'PLN',
    total: asNumber(extra.total),
    period: asString(extra.period),
    charges,
    timeline: charges.length > 0,
  };
}
