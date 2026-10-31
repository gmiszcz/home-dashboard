import { describe, expect, it } from 'vitest';

import {
  ackItemKey,
  CALENDAR_FILTERS,
  CALENDAR_WEEK_FILTER_ID,
  calendarEvents,
  cardSpanClass,
  contentCount,
  contentFingerprint,
  filterCalendarUpdate,
  getCardSpan,
  getSimpleItems,
  hasCalendarLayout,
  isBirthdayEvent,
  isHolidayEvent,
  isSimpleSection,
  nextCardSpan,
  parseStoredWidths,
  sortItems,
  sortSectionItems,
  unreadFirst,
} from './sections';
import type { DashboardItem, SectionUpdate } from './types';

const NOW = new Date('2026-10-30T12:00:00+01:00');

function update(overrides: Partial<SectionUpdate>): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-10-30 11:00:00',
    schema_version: 1,
    section: 'calendar',
    generated_at: '2026-10-30T11:00:00+01:00',
    items: [],
    ...overrides,
  };
}

describe('contentFingerprint', () => {
  it('ignores generated_at, so a resend of the same content is not a change', () => {
    const items = [{ title: 'Dentysta' }];
    const first = update({ items, generated_at: '2026-10-30T10:00:00+01:00' });
    const second = update({ items, generated_at: '2026-10-30T11:30:00+01:00' });
    expect(contentFingerprint(first)).toBe(contentFingerprint(second));
  });

  it('changes when the items change', () => {
    const first = update({ items: [{ title: 'Dentysta' }] });
    const second = update({ items: [{ title: 'Fryzjer' }] });
    expect(contentFingerprint(first)).not.toBe(contentFingerprint(second));
  });
});

describe('isSimpleSection', () => {
  it('is true for a calendar item starting today', () => {
    const today = update({ items: [{ title: 'Dentysta', start: '2026-10-30T15:00:00+01:00' }] });
    expect(isSimpleSection(today, NOW)).toBe(true);
  });

  it('is false for a calendar item starting tomorrow', () => {
    const tomorrow = update({ items: [{ title: 'Dentysta', start: '2026-10-31T15:00:00+01:00' }] });
    expect(isSimpleSection(tomorrow, NOW)).toBe(false);
  });

  it('treats tomorrow as the calendar focus after 18:00', () => {
    const evening = new Date('2026-10-30T19:00:00+01:00');
    const tomorrow = update({ items: [{ title: 'Dentysta', start: '2026-10-31T15:00:00+01:00' }] });
    expect(isSimpleSection(tomorrow, evening)).toBe(true);
    expect(getSimpleItems(tomorrow, evening)).toHaveLength(1);
  });

  it('includes a family event in the next 30 days', () => {
    const family = update({
      section: 'family_events',
      items: [{ title: 'Szczepienie', date: '2026-11-04', simple: false }],
    });
    expect(isSimpleSection(family, NOW)).toBe(true);
    expect(getSimpleItems(family, NOW)).toHaveLength(1);
  });
});

describe('sortItems', () => {
  it('puts pinned items first, then higher priority', () => {
    const items: DashboardItem[] = [
      { id: 'low', priority: 'low' },
      { id: 'high', priority: 'high' },
      { id: 'pinned', priority: 'normal', pinned: true },
    ];
    expect(sortItems(items, 'priority').map((item) => item.id)).toEqual(['pinned', 'high', 'low']);
  });
});

describe('days_plus_week calendar', () => {
  const layout = update({
    layout: 'days_plus_week',
    days: [
      { date: '2026-10-30', label: 'Dziś', events: [{ id: 'a', start: '2026-10-30', all_day: true }] },
      { date: '2026-10-31', label: 'Jutro', events: [] },
      { date: '2026-11-01', label: 'Pojutrze', events: [] },
    ],
    week: {
      from: '2026-11-02',
      to: '2026-11-08',
      events: [{ id: 'b', start: '2026-11-04T08:00:00+01:00' }],
    },
  });

  it('is detected only for the calendar section', () => {
    expect(hasCalendarLayout(layout)).toBe(true);
    expect(hasCalendarLayout({ ...layout, section: 'parcels' })).toBe(false);
    expect(hasCalendarLayout(update({ items: [{ title: 'Dentysta' }] }))).toBe(false);
  });

  it('counts events from days and week', () => {
    expect(calendarEvents(layout).map((event) => event.id)).toEqual(['a', 'b']);
    expect(contentCount(layout)).toBe(2);
  });

  it('shows in the simple view with the same content as the full view', () => {
    expect(isSimpleSection(layout, NOW)).toBe(true);
    expect(getSimpleItems(layout, NOW)).toBe(layout.items);
  });

  it('is hidden from the simple view when there are no events', () => {
    const empty = update({ layout: 'days_plus_week', days: [], week: { from: '2026-11-02', to: '2026-11-08', events: [] } });
    expect(isSimpleSection(empty, NOW)).toBe(false);
  });

  it('fingerprint changes when an event changes', () => {
    const changed = update({
      ...layout,
      week: { from: '2026-11-02', to: '2026-11-08', events: [{ id: 'c', start: '2026-11-05T08:00:00+01:00' }] },
    });
    expect(contentFingerprint(layout)).not.toBe(contentFingerprint(changed));
  });

  it('keeps the fingerprint of an items-only update unchanged', () => {
    const items = [{ title: 'Dentysta' }];
    const plain = update({ items });
    const withFields = update({ items, days: undefined, week: undefined });
    expect(contentFingerprint(plain)).toBe(contentFingerprint(withFields));
  });
});

describe('security_alerts acknowledgment and simple view', () => {
  const alertUpdate = update({
    section: 'security_alerts',
    display: { simple: true },
    items: [
      { id: 'sec-1', title: 'Nowe logowanie iPad' },
      { id: 'sec-2', title: 'Nieudane logowanie SSH' },
    ],
  });

  it('shows in simple view when unread', () => {
    const isAcked = () => false;
    expect(isSimpleSection(alertUpdate, NOW, isAcked)).toBe(true);
    expect(getSimpleItems(alertUpdate, NOW, isAcked)).toHaveLength(2);
  });

  it('filters out acknowledged items in simple view', () => {
    const isAcked = (_sec: string, id: string) => id === 'sec-1';
    expect(isSimpleSection(alertUpdate, NOW, isAcked)).toBe(true);
    const simple = getSimpleItems(alertUpdate, NOW, isAcked);
    expect(simple).toHaveLength(1);
    expect(simple[0].id).toBe('sec-2');
  });

  it('hides entire security_alerts tile when all items are acknowledged', () => {
    const isAcked = (_sec: string, id: string) => id === 'sec-1' || id === 'sec-2';
    expect(isSimpleSection(alertUpdate, NOW, isAcked)).toBe(false);
    expect(getSimpleItems(alertUpdate, NOW, isAcked)).toHaveLength(0);
  });
});

describe('calendar filtering (holidays, birthdays)', () => {
  it('detects holiday and birthday events', () => {
    expect(isHolidayEvent({ title: 'Święto Niepodległości' })).toBe(true);
    expect(isHolidayEvent({ title: 'Dzień wolny' })).toBe(true);
    expect(isHolidayEvent({ calendar: 'Święta w Polsce' })).toBe(true);
    expect(isHolidayEvent({ title: 'Dentysta' })).toBe(false);

    expect(isBirthdayEvent({ title: 'Urodziny Ani' })).toBe(true);
    expect(isBirthdayEvent({ calendar: 'Urodziny' })).toBe(true);
    expect(isBirthdayEvent({ title: 'Dentysta' })).toBe(false);
  });

  it('filters calendar days and week events', () => {
    const cal = update({
      section: 'calendar',
      layout: 'days_plus_week',
      days: [
        {
          date: '2026-10-30',
          events: [
            { id: 'regular', title: 'Spotkanie' },
            { id: 'holiday', title: 'Dzień wolny' },
            { id: 'birthday', title: 'Urodziny Marka' },
          ],
        },
      ],
      week: {
        from: '2026-11-02',
        to: '2026-11-08',
        events: [
          { id: 'w-holiday', title: 'Wszystkich Świętych' },
          { id: 'w-regular', title: 'Przegląd auta' },
        ],
      },
    });

    // Both active
    const both = filterCalendarUpdate(cal, { holidays: true, birthdays: true });
    expect(both.days?.[0].events).toHaveLength(3);
    expect(both.week?.events).toHaveLength(2);

    // Holidays disabled
    const noHolidays = filterCalendarUpdate(cal, { holidays: false, birthdays: true });
    expect(noHolidays.days?.[0].events.map((e) => e.id)).toEqual(['regular', 'birthday']);
    expect(noHolidays.week?.events.map((e) => e.id)).toEqual(['w-regular']);

    // Birthdays disabled
    const noBirthdays = filterCalendarUpdate(cal, { holidays: true, birthdays: false });
    expect(noBirthdays.days?.[0].events.map((e) => e.id)).toEqual(['regular', 'holiday']);

    // Both disabled
    const neither = filterCalendarUpdate(cal, { holidays: false, birthdays: false });
    expect(neither.days?.[0].events.map((e) => e.id)).toEqual(['regular']);
    expect(neither.week?.events.map((e) => e.id)).toEqual(['w-regular']);
  });

  it('drops the week list when the week filter is off and keeps the days', () => {
    const cal = update({
      section: 'calendar',
      layout: 'days_plus_week',
      days: [{ date: '2026-10-30', events: [{ id: 'a', title: 'Spotkanie' }] }],
      week: { from: '2026-11-02', to: '2026-11-08', events: [{ id: 'w', title: 'Przegląd auta' }] },
    });

    const off = filterCalendarUpdate(cal, { week: false });
    expect(off.week).toBeUndefined();
    expect(off.days?.[0].events.map((e) => e.id)).toEqual(['a']);
    expect(contentCount(off)).toBe(1);

    expect(filterCalendarUpdate(cal, { week: true }).week?.events).toHaveLength(1);
    expect(filterCalendarUpdate(cal, {}).week?.events).toHaveLength(1);
  });

  it('keeps legacy flat calendar items when the week filter is off', () => {
    const legacy = update({ section: 'calendar', items: [{ title: 'Dentysta' }] });
    const off = filterCalendarUpdate(legacy, { week: false });
    expect(off.week).toBeUndefined();
    expect(off.items).toHaveLength(1);
  });

  it('registers a persisted week checkbox next to the category filters', () => {
    const week = CALENDAR_FILTERS.find((f) => f.id === CALENDAR_WEEK_FILTER_ID);
    expect(week?.label).toBe('7 dni');
    expect(week?.storageKey).toBe('dashboard.cal_filter_week');
    expect(week?.defaultActive).toBe(true);
    expect(week?.matches).toBeUndefined();
  });
});

describe('custom card grid width (CardSpan)', () => {
  it('cycles span: 1 -> 2 -> 3 -> 1', () => {
    expect(nextCardSpan(1)).toBe(2);
    expect(nextCardSpan(2)).toBe(3);
    expect(nextCardSpan(3)).toBe(1);
  });

  it('parses stored widths supporting booleans and numbers', () => {
    expect(parseStoredWidths(null)).toEqual({});
    expect(parseStoredWidths('bad json')).toEqual({});
    const json = JSON.stringify({
      calendar: 3,
      expenses_weekly: 2,
      finance: 1,
      legacy_true: true,
      legacy_false: false,
    });
    const parsed = parseStoredWidths(json);
    expect(parsed).toEqual({
      calendar: 3,
      expenses_weekly: 2,
      finance: 1,
      legacy_true: 3,
      legacy_false: 1,
    });
  });

  it('resolves card span with default and custom overrides', () => {
    // Finance default is 1 col (not wide)
    expect(getCardSpan('finance', {})).toBe(1);
    expect(getCardSpan('finance', { finance: 2 })).toBe(2);
    expect(getCardSpan('finance', { finance: 3 })).toBe(3);

    // Calendar default is 2 cols (wide)
    expect(getCardSpan('calendar', {})).toBe(2);
    expect(getCardSpan('calendar', { calendar: 1 })).toBe(1);
    expect(getCardSpan('calendar', { calendar: 3 })).toBe(3);
  });

  it('generates correct CSS classes', () => {
    expect(cardSpanClass(1)).toBe(' span-1');
    expect(cardSpanClass(2)).toBe(' span-2');
    expect(cardSpanClass(3)).toBe(' span-full');
  });
});

describe('read marks in AI sections', () => {
  const items: DashboardItem[] = [
    { id: 'low', priority: 'low', headline: 'Low' },
    { id: 'top', priority: 'high', headline: 'Top' },
    { id: 'mid', priority: 'normal', headline: 'Mid' },
    { id: 'mid2', priority: 'normal', headline: 'Mid 2' },
  ];
  const readIds = (ids: string[]) => (_section: string, id: string) => ids.includes(id);
  const ids = (list: DashboardItem[]) => list.map((item) => item.id);

  it('keys an item on id, then url, then headline, then title', () => {
    expect(ackItemKey({ id: 'a', url: 'https://x.example', headline: 'H' })).toBe('a');
    expect(ackItemKey({ url: 'https://x.example', headline: 'H' })).toBe('https://x.example');
    expect(ackItemKey({ headline: ' H ', title: 'T' })).toBe('H');
    expect(ackItemKey({ title: 'T' })).toBe('T');
    expect(ackItemKey({ priority: 'high' })).toBeNull();
    expect(ackItemKey({ headline: 'x'.repeat(300) })).toHaveLength(200);
  });

  it('moves read items after unread ones and keeps the relative order', () => {
    const result = unreadFirst(items, (item) => item.id === 'low' || item.id === 'mid');
    expect(ids(result)).toEqual(['top', 'mid2', 'low', 'mid']);
  });

  it('keeps the priority order when nothing is read', () => {
    const sorted = sortSectionItems('ai_daily', items, 'priority', readIds([]));
    expect(ids(sorted)).toEqual(['top', 'mid', 'mid2', 'low']);
  });

  it('makes the next most important unread item the top one', () => {
    const sorted = sortSectionItems('ai_daily', items, 'priority', readIds(['top']));
    expect(sorted[0].id).toBe('mid');
    expect(ids(sorted)).toEqual(['mid', 'mid2', 'low', 'top']);
  });

  it('never puts a read pinned item on top while unread items exist', () => {
    const pinned: DashboardItem[] = [{ id: 'pin', pinned: true }, { id: 'other' }];
    expect(ids(sortSectionItems('ai_weekly', pinned, 'priority', readIds(['pin'])))).toEqual([
      'other',
      'pin',
    ]);
  });

  it('restores the original position after undo', () => {
    const marked = sortSectionItems('ai_daily', items, 'priority', readIds(['top']));
    const undone = sortSectionItems('ai_daily', items, 'priority', readIds([]));
    expect(marked[0].id).not.toBe('top');
    expect(undone[0].id).toBe('top');
  });

  it('keeps the priority order when every item is read', () => {
    const all = sortSectionItems('ai_daily', items, 'priority', readIds(items.map((i) => String(i.id))));
    expect(ids(all)).toEqual(['top', 'mid', 'mid2', 'low']);
  });

  it('leaves other sections alone', () => {
    const sorted = sortSectionItems('promotions', items, 'priority', readIds(['top']));
    expect(sorted[0].id).toBe('top');
  });

  it('shows the most important unread item in the simple view of ai_daily', () => {
    const daily = update({ section: 'ai_daily', items });
    expect(getSimpleItems(daily, NOW, readIds([])).map((i) => i.id)).toEqual(['top']);
    expect(getSimpleItems(daily, NOW, readIds(['top'])).map((i) => i.id)).toEqual(['mid']);
    const allRead = readIds(items.map((i) => String(i.id)));
    expect(getSimpleItems(daily, NOW, allRead).map((i) => i.id)).toEqual(['top']);
  });
});
