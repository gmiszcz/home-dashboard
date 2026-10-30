import { daysUntil, plural } from '../format';
import type { DashboardItem } from '../types';
import { asString } from './parse';

export function familyCountdown(date: string, now: Date): string {
  const days = daysUntil(date, now);
  if (days === null) return '';
  if (days === 0) return 'dziś';
  if (days === 1) return 'jutro';
  if (days > 1) return `za ${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
  const ago = Math.abs(days);
  if (ago === 1) return 'wczoraj';
  return `${ago} ${plural(ago, 'dzień', 'dni', 'dni')} temu`;
}

export function familyDays(item: DashboardItem, now: Date): number | null {
  const date = asString(item.date);
  if (!date) return null;
  return daysUntil(date, now);
}

/** Upcoming first (soonest), then past events. Items without a date stay at the end. */
export function sortFamilyEvents(items: DashboardItem[], now: Date): DashboardItem[] {
  return [...items].sort((left, right) => {
    const a = familyDays(left, now);
    const b = familyDays(right, now);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const aUpcoming = a >= 0;
    const bUpcoming = b >= 0;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a - b : b - a;
  });
}
