import { describe, expect, it } from 'vitest';

import { contentFingerprint, isSimpleSection, sortItems } from './sections';
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
