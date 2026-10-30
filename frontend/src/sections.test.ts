import { describe, expect, it } from 'vitest';

import {
  calendarEvents,
  contentCount,
  contentFingerprint,
  getSimpleItems,
  hasCalendarLayout,
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
