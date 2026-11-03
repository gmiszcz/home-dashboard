import { describe, expect, it } from 'vitest';

import { familyFavoriteKeys, isStarredInFamily, mergeFamilyFavorites } from './aiFavorites';
import { markKey } from './marks';
import type { FavoriteRecord } from './types';

function favorite(section: string, itemId: string, savedAt: string): FavoriteRecord {
  return { section, item_id: itemId, saved_at: savedAt, item_data: { headline: itemId } };
}

describe('familyFavoriteKeys', () => {
  it('returns both AI section keys for an AI section', () => {
    expect(familyFavoriteKeys('ai_daily', 'art-1')).toEqual([
      markKey('ai_daily', 'art-1'),
      markKey('ai_weekly', 'art-1'),
    ]);
  });

  it('returns a single key for a non-AI section', () => {
    expect(familyFavoriteKeys('job_offers', 'job-1')).toEqual([markKey('job_offers', 'job-1')]);
  });
});

describe('isStarredInFamily', () => {
  it('reads an AI article as starred when only the other AI section holds it', () => {
    const starred = new Set([markKey('ai_weekly', 'art-1')]);
    expect(isStarredInFamily('ai_daily', 'art-1', (key) => starred.has(key))).toBe(true);
  });

  it('matches a job_offers id only against its own key', () => {
    const starred = new Set([markKey('ai_daily', 'job-1')]);
    expect(isStarredInFamily('job_offers', 'job-1', (key) => starred.has(key))).toBe(false);
  });

  it('is false when no family member holds it', () => {
    expect(isStarredInFamily('ai_daily', 'art-1', () => false)).toBe(false);
  });
});

describe('mergeFamilyFavorites', () => {
  it('merges both AI sections and lists the article once', () => {
    const favorites = [
      favorite('ai_daily', 'art-1', '2024-01-01T00:00:00Z'),
      favorite('ai_weekly', 'art-1', '2024-01-02T00:00:00Z'),
    ];
    const merged = mergeFamilyFavorites('ai_daily', favorites);
    expect(merged).toHaveLength(1);
    expect(merged[0].item_id).toBe('art-1');
    // The more recent record wins when the same article is favorited in both.
    expect(merged[0].section).toBe('ai_weekly');
  });

  it('returns the same merged set for either AI section', () => {
    const favorites = [
      favorite('ai_daily', 'art-1', '2024-01-01T00:00:00Z'),
      favorite('ai_weekly', 'art-2', '2024-01-02T00:00:00Z'),
    ];
    const fromDaily = mergeFamilyFavorites('ai_daily', favorites).map((f) => f.item_id);
    const fromWeekly = mergeFamilyFavorites('ai_weekly', favorites).map((f) => f.item_id);
    expect(fromDaily).toEqual(['art-2', 'art-1']);
    expect(fromWeekly).toEqual(['art-2', 'art-1']);
  });

  it('sorts by saved_at descending', () => {
    const favorites = [
      favorite('ai_daily', 'old', '2024-01-01T00:00:00Z'),
      favorite('ai_daily', 'new', '2024-03-01T00:00:00Z'),
      favorite('ai_weekly', 'mid', '2024-02-01T00:00:00Z'),
    ];
    expect(mergeFamilyFavorites('ai_daily', favorites).map((f) => f.item_id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
  });

  it('returns only a non-AI section own favorites, unchanged', () => {
    const favorites = [
      favorite('job_offers', 'job-1', '2024-01-01T00:00:00Z'),
      favorite('ai_daily', 'art-1', '2024-01-02T00:00:00Z'),
    ];
    const merged = mergeFamilyFavorites('job_offers', favorites);
    expect(merged).toHaveLength(1);
    expect(merged[0].item_id).toBe('job-1');
    expect(merged[0].section).toBe('job_offers');
  });
});
