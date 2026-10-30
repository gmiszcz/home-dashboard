import { parseTime, plural } from '../format';

/** Live countdown until a parcel deadline. Null when the deadline cannot be parsed. */
export function deadlineCountdown(deadline: string, now: Date): string | null {
  const end = parseTime(deadline);
  if (!end) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 'termin minął';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} ${plural(days, 'dzień', 'dni', 'dni')} ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}
