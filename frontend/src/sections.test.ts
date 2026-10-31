import { describe, expect, it } from 'vitest';

import {
  calendarEvents,
  contentCount,
  contentFingerprint,
  filterCalendarUpdate,
  getSimpleItems,
  hasCalendarLayout,
  isBirthdayEvent,
  isHolidayEvent,
  isSimpleSection,
  sortItems,
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
});
