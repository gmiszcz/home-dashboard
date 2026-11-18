/** One tile filling the board. Stored on the device and in `?tile=`. */
export const ISOLATE_KEY = 'dashboard_isolated_tile';
export const TILE_PARAM = 'tile';
export const ISOLATE_HISTORY = 'dashboard-isolate';

export function tileParam(search: string): string | null {
  const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(TILE_PARAM);
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

/** Path, query and hash with `tile` set or removed. Other parameters stay. */
export function hrefWithTile(href: string, section: string | null): string {
  const url = new URL(href, 'http://localhost');
  if (section) url.searchParams.set(TILE_PARAM, section);
  else url.searchParams.delete(TILE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Keep `candidate` while the section list is still unknown (`known === null`).
 * Once the list is known, drop a candidate that is not in it.
 */
export function resolveIsolatedTile(candidate: string | null, known: readonly string[] | null): string | null {
  if (!candidate) return null;
  if (known === null) return candidate;
  return known.includes(candidate) ? candidate : null;
}
