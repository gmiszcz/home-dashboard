import type { SectionUpdate } from './types';

/** Device preference: show tiles marked `display.hidden`. Default is off. */
export const SHOW_HIDDEN_KEY = 'dashboard_show_hidden';

/**
 * Per-tile override. A boolean true hides the tile, false shows it even when
 * the payload says `display.hidden`. Missing keys follow the payload.
 */
export const TILE_HIDDEN_KEY = 'dashboard_tile_hidden';

export function payloadHidden(update: SectionUpdate): boolean {
  return update.display?.hidden === true;
}

export function isTileHidden(update: SectionUpdate, overrides: Record<string, boolean>): boolean {
  const override = overrides[update.section];
  if (typeof override === 'boolean') return override;
  return payloadHidden(update);
}

export function parseHiddenOverrides(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}
