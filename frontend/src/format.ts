const WARSAW = 'Europe/Warsaw';

export function parseTime(value: string): Date | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T12:00:00+01:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const normalized =
    trimmed.includes(' ') && !trimmed.includes('T') ? `${trimmed.replace(' ', 'T')}Z` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function warsawDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WARSAW,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function dateKeyFromField(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = parseTime(value);
  return date ? warsawDateKey(date) : null;
}

/** Whole calendar days from today (Warsaw) until value. Negative when value is in the past. */
export function daysUntil(value: string, now: Date): number | null {
  const key = dateKeyFromField(value);
  if (!key) return null;
  const today = warsawDateKey(now);
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

export function formatClock(now: Date): { time: string; date: string } {
  const time = new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const date = new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { time, date };
}

export function formatDateTime(value: string): string {
  const date = parseTime(value);
  if (!date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Intl.DateTimeFormat('pl-PL', {
      timeZone: WARSAW,
      day: 'numeric',
      month: 'long',
    }).format(date);
  }
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Short Polish day label for a YYYY-MM-DD key, e.g. "pon., 2 lis". */
export function formatDayLabel(key: string): string {
  const date = parseTime(key);
  if (!date) return key;
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return 'cały dzień';
  const date = parseTime(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: WARSAW,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatRelative(value: string, now: Date): string {
  const date = parseTime(value);
  if (!date) return '';
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return 'przed chwilą';
  const ahead = minutes < 0;
  const span = Math.abs(minutes);
  let text: string;
  if (span < 60) {
    text = `${span} ${plural(span, 'minutę', 'minuty', 'minut')}`;
  } else if (span < 60 * 24) {
    const hours = Math.round(span / 60);
    text = `${hours} ${plural(hours, 'godzinę', 'godziny', 'godzin')}`;
  } else {
    const days = Math.round(span / (60 * 24));
    text = `${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
  }
  return ahead ? `za ${text}` : `${text} temu`;
}

export type Freshness = 'today' | 'yesterday' | 'old' | 'unknown';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Freshness of a section's data for the tile LED.
 * today: same calendar day (Warsaw) as now. yesterday: an earlier day but at most 24 h old.
 * old: more than 24 h old. unknown: the value cannot be parsed.
 */
export function dataFreshness(value: string, now: Date): Freshness {
  const date = parseTime(value);
  if (!date) return 'unknown';
  if (now.getTime() - date.getTime() > DAY_MS) return 'old';
  return warsawDateKey(date) === warsawDateKey(now) ? 'today' : 'yesterday';
}

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  today: 'Dane z dziś',
  yesterday: 'Dane z wczoraj',
  old: 'Dane starsze niż 24 h',
  unknown: 'Nieznana data danych',
};

export function formatMoney(amount: number, currency = 'PLN'): string {
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('pl-PL')} ${currency}`;
  }
}

export function addDaysKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
