import { STORAGE_WIDTH_KEY } from './sections';
import type { SectionUpdate } from './types';

/** People the board can show. Missing `profiles` on a tile means Patryk only. */
export const PROFILES = ['patryk', 'ola'] as const;
export type DashboardProfile = (typeof PROFILES)[number];

export const PROFILE_STORAGE_KEY = 'dashboard_profile';

/** Patryk keeps the key the board already used, so a saved layout stays put. */
export const ORDER_STORAGE_KEY = 'dashboard_custom_order';

const PROFILE_SET: ReadonlySet<string> = new Set(PROFILES);

export function layoutOrderKey(profile: DashboardProfile): string {
  return profile === 'patryk' ? ORDER_STORAGE_KEY : `${ORDER_STORAGE_KEY}_${profile}`;
}

export function layoutWidthKey(profile: DashboardProfile): string {
  return profile === 'patryk' ? STORAGE_WIDTH_KEY : `${STORAGE_WIDTH_KEY}_${profile}`;
}

/** Known names in stable order, or null when the list has none. */
export function listedProfiles(value: unknown): DashboardProfile[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const found = new Set<DashboardProfile>();
  for (const item of value) {
    if (typeof item === 'string' && PROFILE_SET.has(item)) found.add(item as DashboardProfile);
  }
  if (found.size === 0) return null;
  return PROFILES.filter((name) => found.has(name));
}

/**
 * Server map wins for a section that has an entry. Otherwise the tile payload.
 * A missing field, or a list with no known name, is Patryk only.
 */
export function effectiveProfiles(
  update: Pick<SectionUpdate, 'section' | 'profiles'>,
  assigned: Readonly<Record<string, readonly string[]>>,
): DashboardProfile[] {
  if (Object.prototype.hasOwnProperty.call(assigned, update.section)) {
    const fromServer = listedProfiles(assigned[update.section]);
    if (fromServer) return fromServer;
  }
  return listedProfiles(update.profiles) ?? ['patryk'];
}

export function tileMatchesProfile(
  update: Pick<SectionUpdate, 'section' | 'profiles'>,
  assigned: Readonly<Record<string, readonly string[]>>,
  profile: DashboardProfile,
): boolean {
  return effectiveProfiles(update, assigned).includes(profile);
}

/** True when the tile is on both boards. The card draws a small "wspólne" mark. */
export function isSharedTile(
  update: Pick<SectionUpdate, 'section' | 'profiles'>,
  assigned: Readonly<Record<string, readonly string[]>>,
): boolean {
  const names = effectiveProfiles(update, assigned);
  return names.includes('patryk') && names.includes('ola');
}
