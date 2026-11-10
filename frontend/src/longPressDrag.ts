/** Hold still this long before a tile can be dragged. */
export const LONG_PRESS_MS = 450;

/** Pickup pulse: scale to 1.03, then settle at 1.01. */
export const TILE_PICKUP_MS = 280;

/** How long a tile takes to slide into a new slot. */
export const TILE_MOVE_MS = 230;

export const TILE_MOVE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** Transform transition for a FLIP move. None when the user prefers reduced motion. */
export function tileMoveTransition(reduceMotion: boolean): string {
  if (reduceMotion) return 'none';
  return `transform ${TILE_MOVE_MS}ms ${TILE_MOVE_EASE}`;
}

/** Movement beyond this, before the hold ends, is a scroll or a normal gesture. */
export const LONG_PRESS_SLOP_PX = 10;

export function longPressMovedTooFar(dx: number, dy: number, slop = LONG_PRESS_SLOP_PX): boolean {
  return dx * dx + dy * dy > slop * slop;
}

/**
 * Controls keep their taps. The title button is the tile surface, so a hold there may drag.
 * Anything else that is a button, link or field does not start a drag.
 */
export function blocksTileDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest('a, input, label, select, textarea, button, [role="button"]');
  if (!interactive) return false;
  return !interactive.closest('.card-head-name, .card-head-chevron');
}
