import { markKey } from './marks';
import { ackFamilySections } from './sections';
import type { FavoriteRecord } from './types';

/** Mark keys that a favorite on `itemId` touches across the section's family. */
export function familyFavoriteKeys(section: string, itemId: string): string[] {
  return ackFamilySections(section).map((member) => markKey(member, itemId));
}

/** Whether `itemId` is starred in any member of the section's family. */
export function isStarredInFamily(
  section: string,
  itemId: string,
  has: (key: string) => boolean,
): boolean {
  return familyFavoriteKeys(section, itemId).some(has);
}

/**
 * Favorites to show for `section`, merged across its family and de-duplicated by
 * item id. ai_daily and ai_weekly carry the same item id for the same article, so a
 * star in one AI section shows in both, listed once. When the same article is favorited
 * in both underlying sections the most recently saved record wins. Non-AI sections have
 * a single family member, so they return only their own favorites, unchanged. Sorted by
 * `saved_at` descending.
 */
export function mergeFamilyFavorites(
  section: string,
  favorites: Iterable<FavoriteRecord>,
): FavoriteRecord[] {
  const members = new Set(ackFamilySections(section));
  const byItem = new Map<string, FavoriteRecord>();
  for (const favorite of favorites) {
    if (!members.has(favorite.section)) continue;
    const existing = byItem.get(favorite.item_id);
    if (!existing || favorite.saved_at.localeCompare(existing.saved_at) > 0) {
      byItem.set(favorite.item_id, favorite);
    }
  }
  return [...byItem.values()].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}
