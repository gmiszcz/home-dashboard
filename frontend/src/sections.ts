import { addDaysKey, dateKeyFromField, daysUntil, warsawDateKey } from './format';
import type { CalendarEvent, DashboardItem, SectionDisplay, SectionUpdate } from './types';

export interface SectionMeta {
  title: string;
  icon: string;
  wide?: boolean;
}

export const SECTION_ORDER = [
  'calendar',
  'parcels',
  'family_events',
  'ai_daily',
  'ai_weekly',
  'email_digest',
  'promotions',
  'prices',
  'inbox_cleanup',
  'subscriptions',
  'expenses_weekly',
  'finance',
  'allegro_watch',
  'security_alerts',
  'github_weekly',
] as const;

export const SECTION_META: Record<string, SectionMeta> = {
  calendar: { title: 'Kalendarz', icon: 'pi pi-calendar', wide: true },
  parcels: { title: 'Przesyłki', icon: 'pi pi-truck' },
  family_events: { title: 'Rodzina', icon: 'pi pi-heart' },
  email_digest: { title: 'Poczta', icon: 'pi pi-envelope' },
  allegro_watch: { title: 'Allegro', icon: 'pi pi-shopping-bag' },
  security_alerts: { title: 'Bezpieczeństwo', icon: 'pi pi-shield' },
  prices: { title: 'Ceny', icon: 'pi pi-tag' },
  promotions: { title: 'Promocje', icon: 'pi pi-megaphone' },
  subscriptions: { title: 'Subskrypcje', icon: 'pi pi-replay' },
  expenses_weekly: { title: 'Wydatki tygodnia', icon: 'pi pi-wallet' },
  finance: { title: 'Finanse', icon: 'pi pi-chart-bar' },
  ai_daily: { title: 'AI dziś', icon: 'pi pi-bolt' },
  ai_weekly: { title: 'AI w tym tygodniu', icon: 'pi pi-book' },
  github_weekly: { title: 'GitHub', icon: 'pi pi-github' },
  inbox_cleanup: { title: 'Skrzynka', icon: 'pi pi-inbox' },
};

export const DEFAULT_SECTION_DISPLAY: Record<string, SectionDisplay> = {
  calendar:        { collapsed: false, max_visible: 3, sort: 'time' },
  parcels:         { collapsed: false, max_visible: 3, sort: 'priority' },
  family_events:   { collapsed: false, max_visible: 4, sort: 'time' },
  email_digest:    { collapsed: false, max_visible: 1, sort: 'priority' },
  prices:          { collapsed: false, max_visible: 3, sort: 'priority' },
  promotions:      { collapsed: false, max_visible: 3, sort: 'priority' },
  ai_daily:        { collapsed: false, max_visible: 1, sort: 'priority' },
  ai_weekly:       { collapsed: true,  max_visible: 0, sort: 'priority' },
  subscriptions:   { collapsed: false, max_visible: 0, sort: 'time' },
  expenses_weekly: { collapsed: false, max_visible: 0, sort: 'time' },
  finance:         { collapsed: false, max_visible: 0, sort: 'time' },
  allegro_watch:   { collapsed: true,  max_visible: 3, sort: 'priority' },
  security_alerts: { collapsed: false, max_visible: 3, sort: 'time' },
  github_weekly:   { collapsed: true,  max_visible: 0, sort: 'priority' },
  inbox_cleanup:   { collapsed: true,  max_visible: 0, sort: 'priority' },
};

export const PARCEL_STATUS: Record<string, { label: string; severity: TagSeverity }> = {
  shipped: { label: 'wysłana', severity: 'secondary' },
  in_transit: { label: 'w drodze', severity: 'info' },
  ready_for_pickup: { label: 'do odbioru', severity: 'warning' },
  picked_up: { label: 'odebrana', severity: 'success' },
  returned: { label: 'zwrócona', severity: 'danger' },
};

export const EMAIL_GROUP: Record<string, string> = {
  subscriptions_finance: 'subskrypcje i finanse',
  purchases: 'zakupy',
  parcels: 'przesyłki',
  direct: 'bezpośrednie',
  ai_newsletters: 'newslettery AI',
};

export const AVAILABILITY: Record<string, string> = {
  online_delivery: 'dostawa',
  in_store: 'w sklepie',
};

export const GITHUB_TYPE: Record<string, { label: string; severity: TagSeverity }> = {
  feature: { label: 'funkcja', severity: 'success' },
  release: { label: 'wydanie', severity: 'info' },
  fix: { label: 'poprawka', severity: 'warning' },
};

export type TagSeverity = 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast';

export function sectionMeta(section: string): SectionMeta {
  return SECTION_META[section] ?? { title: section, icon: 'pi pi-th-large' };
}

/**
 * Short hash of what the user actually reads (summary + items).
 * generated_at is left out, so a resend of the same content does not count as a change.
 */
export function contentFingerprint(update: SectionUpdate): string {
  // days/week are only added when present, so fingerprints of other sections stay unchanged
  const content: Record<string, unknown> = { summary: update.summary ?? null, items: update.items };
  if (hasCalendarLayout(update)) {
    content.days = update.days ?? null;
    content.week = update.week ?? null;
  }
  const text = JSON.stringify(content);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Calendar payload with days (Dziś, Jutro, Pojutrze) and the following week instead of items. */
export function hasCalendarLayout(update: SectionUpdate): boolean {
  return update.section === 'calendar' && (Array.isArray(update.days) || Boolean(update.week));
}

/** All events of the days/week calendar layout. */
export function calendarEvents(update: SectionUpdate): CalendarEvent[] {
  if (!hasCalendarLayout(update)) return [];
  const fromDays = (update.days ?? []).flatMap((day) => day.events ?? []);
  return [...fromDays, ...(update.week?.events ?? [])];
}

/** Number of entries a tile shows: calendar events for the days/week layout, items otherwise. */
export function contentCount(update: SectionUpdate): number {
  return hasCalendarLayout(update) ? calendarEvents(update).length : update.items.length;
}

export function hasPendingParcels(items?: DashboardItem[]): boolean {
  if (!items || items.length === 0) return false;
  return items.some(
    (item) => item.status && item.status !== 'picked_up' && item.status !== 'returned'
  );
}

export function defaultSectionRank(section: string, pendingParcels = false): number {
  if (section === 'calendar') return 10;
  if (section === 'parcels') {
    return pendingParcels ? 15 : 65;
  }
  if (section === 'family_events') return 18;
  if (section === 'ai_daily') return 20;
  if (section === 'ai_weekly') return 25;
  if (section === 'email_digest') return 30;
  if (section === 'security_alerts') return 32;
  if (section === 'promotions') return 40;
  if (section === 'prices') return 50;
  if (section === 'inbox_cleanup') return 70;
  if (section === 'subscriptions') return 80;
  if (section === 'expenses_weekly') return 85;
  if (section === 'finance') return 90;
  if (section === 'allegro_watch') return 93;
  if (section === 'github_weekly') return 95;
  return 60;
}

export type Daypart = 'morning' | 'day' | 'evening';

/** Hour in Europe/Warsaw, 0–23. */
export function warsawHour(now: Date): number {
  const value = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const hour = Number(value);
  return hour === 24 ? 0 : hour;
}

/** Morning is before 12:00, evening is from 18:00, both in Europe/Warsaw. */
export function daypart(now: Date): Daypart {
  const hour = warsawHour(now);
  if (hour < 12) return 'morning';
  if (hour >= 18) return 'evening';
  return 'day';
}

/** Calendar day the simple view cares about: tomorrow in the evening, otherwise today. */
export function calendarFocusKey(now: Date): string {
  const today = warsawDateKey(now);
  return daypart(now) === 'evening' ? addDaysKey(today, 1) : today;
}

/**
 * Moves calendar + ai_daily to the front in the morning, and parcels + calendar in the evening.
 * Disabled or midday leaves the given order untouched.
 */
export function boostedSectionOrder(order: readonly string[], now: Date, enabled: boolean): string[] {
  const list = [...order];
  if (!enabled) return list;
  const part = daypart(now);
  const front = part === 'morning' ? ['calendar', 'ai_daily'] : part === 'evening' ? ['parcels', 'calendar'] : [];
  const lead = front.filter((name) => list.includes(name));
  if (lead.length === 0) return list;
  return [...lead, ...list.filter((name) => !lead.includes(name))];
}

/**
 * Manual drag order wins. Without one, the default order follows the time of day when the setting is on.
 */
export function resolveSectionOrder(
  sectionNames: readonly string[],
  manualOrder: readonly string[] | null,
  now: Date,
  timeOrderEnabled: boolean,
): string[] {
  if (manualOrder && manualOrder.length > 0) {
    const missing = sectionNames.filter((name) => !manualOrder.includes(name));
    return [...manualOrder, ...missing];
  }
  const base: string[] = [...SECTION_ORDER];
  for (const name of sectionNames) {
    if (!base.includes(name)) base.push(name);
  }
  return boostedSectionOrder(base, now, timeOrderEnabled);
}

export function sectionRank(section: string, update?: SectionUpdate): number {
  const isPending = update?.section === 'parcels' ? hasPendingParcels(update.items) : false;
  return defaultSectionRank(section, isPending);
}

export function sortItems(items: DashboardItem[], sortMode?: string): DashboardItem[] {
  if (!items || items.length <= 1) return items ?? [];
  const copy = [...items];
  if (sortMode === 'time') {
    return copy.sort((a, b) => {
      const tA = String(a.start ?? a.date ?? a.deadline ?? '');
      const tB = String(b.start ?? b.date ?? b.deadline ?? '');
      return tA.localeCompare(tB);
    });
  }
  return copy.sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;

    const score = (p?: unknown) => {
      const s = typeof p === 'string' ? p.toLowerCase() : '';
      if (s === 'high' || s === 'urgent' || s === 'critical') return 3;
      if (s === 'normal' || s === 'medium') return 2;
      if (s === 'low') return 1;
      return 1.5;
    };
    return score(b.priority) - score(a.priority);
  });
}

export type CardSpan = 1 | 2 | 3;

export const STORAGE_WIDTH_KEY = 'dashboard_custom_widths';

export function parseStoredWidths(raw: string | null): Record<string, CardSpan> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: Record<string, CardSpan> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val === 3 || val === true) result[key] = 3;
      else if (val === 2) result[key] = 2;
      else if (val === 1 || val === false) result[key] = 1;
    }
    return result;
  } catch {
    return {};
  }
}

export function getCardSpan(
  section: string,
  widths: Record<string, CardSpan>,
  defaultWide?: boolean
): CardSpan {
  if (widths[section] !== undefined) {
    return widths[section];
  }
  if (defaultWide !== undefined) {
    return defaultWide ? 2 : 1;
  }
  const meta = sectionMeta(section);
  return meta.wide ? 2 : 1;
}

export function nextCardSpan(current: CardSpan): CardSpan {
  if (current === 1) return 2;
  if (current === 2) return 3;
  return 1;
}

export function cardSpanClass(span: CardSpan): string {
  if (span === 3) return ' span-full';
  if (span === 2) return ' span-2';
  return ' span-1';
}

export interface CalendarFilterConfig {
  id: string;
  label: string;
  storageKey: string;
  defaultActive: boolean;
  matches: (event: CalendarEvent | DashboardItem) => boolean;
}

export function isHolidayEvent(event: CalendarEvent | DashboardItem): boolean {
  const title = String(event.title ?? '').toLowerCase();
  const calendar = String(event.calendar ?? '').toLowerCase();
  const category = String(event.category ?? '').toLowerCase();

  if (
    calendar.includes('święt') ||
    calendar.includes('holiday') ||
    calendar.includes('dni wolne') ||
    calendar.includes('dzień wolny')
  ) {
    return true;
  }
  if (category.includes('święt') || category.includes('holiday')) {
    return true;
  }
  if (
    title.includes('święt') ||
    title.includes('dzień wolny') ||
    title.includes('holiday') ||
    title.includes('boże narodzenie') ||
    title.includes('wielkanoc') ||
    title.includes('nowy rok') ||
    title.includes('trzech króli')
  ) {
    return true;
  }
  return false;
}

export function isBirthdayEvent(event: CalendarEvent | DashboardItem): boolean {
  const title = String(event.title ?? '').toLowerCase();
  const calendar = String(event.calendar ?? '').toLowerCase();
  const category = String(event.category ?? '').toLowerCase();

  if (
    calendar.includes('urodzin') ||
    calendar.includes('birthday') ||
    calendar.includes('birthdays')
  ) {
    return true;
  }
  if (category.includes('urodzin') || category.includes('birthday')) {
    return true;
  }
  if (title.includes('urodzin') || title.includes('birthday') || /\bb-?day\b/i.test(title)) {
    return true;
  }
  return false;
}

export const CALENDAR_FILTERS: CalendarFilterConfig[] = [
  {
    id: 'holidays',
    label: 'Święta',
    storageKey: 'dashboard.cal_filter_holidays',
    defaultActive: true,
    matches: isHolidayEvent,
  },
  {
    id: 'birthdays',
    label: 'Urodziny',
    storageKey: 'dashboard.cal_filter_birthdays',
    defaultActive: true,
    matches: isBirthdayEvent,
  },
];

export function shouldShowCalendarEvent(
  event: CalendarEvent | DashboardItem,
  filters: Record<string, boolean>
): boolean {
  for (const filter of CALENDAR_FILTERS) {
    if (filter.matches(event)) {
      if (filters[filter.id] === false) {
        return false;
      }
    }
  }
  return true;
}

export function filterCalendarUpdate(
  update: SectionUpdate,
  filters: Record<string, boolean>
): SectionUpdate {
  if (update.section !== 'calendar') return update;

  const filterEvt = (e: CalendarEvent) => shouldShowCalendarEvent(e, filters);
  const filterItem = (item: DashboardItem) => shouldShowCalendarEvent(item, filters);

  const days = update.days?.map((day) => ({
    ...day,
    events: (day.events ?? []).filter(filterEvt),
  }));

  const week = update.week
    ? {
        ...update.week,
        events: (update.week.events ?? []).filter(filterEvt),
      }
    : undefined;

  const items = (update.items ?? []).filter(filterItem);

  return {
    ...update,
    days,
    week,
    items,
  };
}

/**
 * Whether a section qualifies for the Simple View
 */
export function isSimpleSection(
  update: SectionUpdate,
  now: Date,
  isItemAcked?: (section: string, itemId: string) => boolean,
): boolean {
  // Security alerts disappear from Simple View when all items are acknowledged
  if (update.section === 'security_alerts') {
    const unread = update.items.filter(
      (item) => !item.id || !isItemAcked || !isItemAcked(update.section, String(item.id))
    );
    if (unread.length === 0) {
      return false;
    }
    if (update.display?.simple !== undefined) {
      return Boolean(update.display.simple);
    }
    return true;
  }

  if (update.display?.simple !== undefined) {
    return Boolean(update.display.simple);
  }

  // Any item explicitly marked simple: true (and not acknowledged)
  if (
    update.items.some(
      (item) =>
        item.simple === true &&
        (!item.id || !isItemAcked || !isItemAcked(update.section, String(item.id)))
    )
  ) {
    return true;
  }

  // Default Simple View heuristic (when the sender did not provide display.simple)
  if (hasCalendarLayout(update)) {
    return calendarEvents(update).length > 0;
  }

  if (update.section === 'calendar') {
    const today = warsawDateKey(now);
    const focus = calendarFocusKey(now);
    return update.items.some((item) => {
      const start = String(item.start ?? item.date ?? '');
      const key = start ? dateKeyFromField(start) : null;
      return key === today || key === focus;
    });
  }

  if (update.section === 'parcels') {
    return hasPendingParcels(update.items);
  }

  if (update.section === 'ai_daily') {
    return update.items.length > 0;
  }

  if (update.section === 'family_events') {
    return update.items.some((item) => {
      const date = typeof item.date === 'string' ? item.date : '';
      const days = date ? daysUntil(date, now) : null;
      return days !== null && days >= 0 && days <= 30;
    });
  }

  return false;
}

/**
 * Picks the items to show in the Simple View
 */
export function getSimpleItems(
  update: SectionUpdate,
  now: Date,
  isItemAcked?: (section: string, itemId: string) => boolean,
): DashboardItem[] {
  // The days/week calendar looks the same in both views
  if (hasCalendarLayout(update)) return update.items;

  if (update.section === 'security_alerts') {
    return update.items.filter(
      (item) => !item.id || !isItemAcked || !isItemAcked(update.section, String(item.id))
    );
  }

  const explicit = update.items.filter(
    (item) =>
      item.simple === true &&
      (!item.id || !isItemAcked || !isItemAcked(update.section, String(item.id)))
  );
  if (explicit.length > 0) return explicit;

  if (update.section === 'calendar') {
    const today = warsawDateKey(now);
    const focus = calendarFocusKey(now);
    const onDay = (day: string) =>
      update.items.filter((item) => {
        const start = String(item.start ?? item.date ?? '');
        return start ? dateKeyFromField(start) === day : false;
      });
    const primary = onDay(focus);
    return (primary.length > 0 ? primary : onDay(today)).slice(0, 2);
  }

  if (update.section === 'family_events') {
    return update.items
      .filter((item) => {
        const date = typeof item.date === 'string' ? item.date : '';
        const days = date ? daysUntil(date, now) : null;
        return days !== null && days >= 0 && days <= 30;
      })
      .slice(0, 3);
  }

  if (update.section === 'parcels') {
    return update.items
      .filter((item) => item.status && item.status !== 'picked_up' && item.status !== 'returned')
      .slice(0, 3);
  }

  if (update.section === 'ai_daily') {
    return update.items.slice(0, 1);
  }

  return update.items.slice(0, 1);
}
