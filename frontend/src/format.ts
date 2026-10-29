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

function plural(count: number, one: string, few: string, many: string): string {
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

export function isStale(value: string, now: Date, staleMinutes: number): boolean {
  const date = parseTime(value);
  if (!date) return false;
  return now.getTime() - date.getTime() > staleMinutes * 60_000;
}

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
