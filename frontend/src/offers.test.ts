import { describe, expect, it } from 'vitest';

import {
  isOfferExcluded,
  isOfferUpdate,
  offerBadges,
  offerDescription,
  offerPrice,
  offerReserved,
  offerTitle,
  offerUrl,
  sortOfferItems,
} from './offers';
import type { DashboardItem, ExclusionRecord } from './types';

function item(partial: DashboardItem): DashboardItem {
  return partial;
}

function exclusion(partial: Partial<ExclusionRecord> & Pick<ExclusionRecord, 'offer_id'>): ExclusionRecord {
  return {
    section: 'gabinety',
    url: null,
    title: null,
    excluded_at: '2026-11-01T00:00:00+00:00',
    ...partial,
  };
}

describe('offer fields', () => {
  it('reads the canonical fields and the older Polish names', () => {
    const legacy = item({
      id: '1',
      nazwa: 'Gabinet na Zwycięstwa',
      link: 'https://example.com/g',
      cena: 1800,
      lokalizacja: 'Gliwice',
      opis: 'Dwa dni w tygodniu',
    });
    expect(offerTitle(legacy)).toBe('Gabinet na Zwycięstwa');
    expect(offerUrl(legacy)).toBe('https://example.com/g');
    expect(offerPrice(legacy)).toBe('1800');
    expect(offerDescription(legacy)).toBe('Dwa dni w tygodniu');
  });

  it('prefers description over text and subtitle', () => {
    expect(
      offerDescription(item({ description: 'Opis', text: 'Tekst', subtitle: 'Podtytuł' })),
    ).toBe('Opis');
    expect(offerDescription(item({ text: 'Tekst', subtitle: 'Podtytuł' }))).toBe('Tekst');
    expect(offerDescription(item({ subtitle: 'Podtytuł' }))).toBe('Podtytuł');
  });

  it('treats renderer offers and the legacy section names as offer tiles', () => {
    const base = { section: 'wynajem' };
    expect(isOfferUpdate({ ...base, renderer: 'offers' })).toBe(true);
    expect(isOfferUpdate({ ...base, type: 'offers' })).toBe(true);
    expect(isOfferUpdate({ ...base, section: 'gabinety' })).toBe(true);
    expect(isOfferUpdate({ ...base, section: 'domki' })).toBe(true);
    expect(isOfferUpdate(base)).toBe(false);
  });
});

describe('sortOfferItems', () => {
  it('puts favorites first, then rank, and keeps the original order otherwise', () => {
    const items = [
      item({ id: 'c', title: 'C', rank: 1 }),
      item({ id: 'a', title: 'A' }),
      item({ id: 'b', title: 'B', rank: 2 }),
    ];
    const sorted = sortOfferItems(items, (id) => id === 'a').map((entry) => entry.id);
    expect(sorted).toEqual(['a', 'c', 'b']);
  });

  it('puts reserved offers ahead of favorites', () => {
    const items = [
      item({ id: 'loved', title: 'Ulubiona' }),
      item({ id: 'held', title: 'Zarezerwowana', reserved: true, rank: 9 }),
    ];
    expect(sortOfferItems(items, (id) => id === 'loved').map((entry) => entry.id)).toEqual(['held', 'loved']);
    expect(offerReserved(items[1])).toBe(true);
  });
});

describe('offerBadges', () => {
  it('reads badge and badges, and does not repeat the reserved pill', () => {
    expect(offerBadges(item({ badge: 'bezpośrednio', badges: ['2 dni', 'bezpośrednio'] }))).toEqual([
      'bezpośrednio',
      '2 dni',
    ]);
    expect(
      offerBadges(item({ reserved: true, badges: ['Zarezerwowane', 'winda'] })),
    ).toEqual(['winda']);
  });
});

describe('isOfferExcluded', () => {
  it('matches the offer id and, separately, the url', () => {
    const byId = [exclusion({ offer_id: 'a', url: 'https://old.example/a' })];
    expect(isOfferExcluded(item({ id: 'a', url: 'https://new.example/a' }), byId)).toBe(true);
    const byUrl = [exclusion({ offer_id: 'gone', url: 'https://example.com/same' })];
    expect(isOfferExcluded(item({ id: 'fresh', url: 'https://example.com/same' }), byUrl)).toBe(true);
    expect(isOfferExcluded(item({ id: 'other', url: 'https://example.com/other' }), byUrl)).toBe(false);
  });
});
