/** Hold still this long before a tile can be dragged. */
export const LONG_PRESS_MS = 450;

/** Pickup pulse: scale to 1.04, then settle at 1.02. Slow enough to read. */
export const TILE_PICKUP_MS = 500;

export const TILE_PICKUP_PEAK = 1.04;

export const TILE_PICKUP_HOLD = 1.02;

/** Drop: the lifted tile eases back to its slot and to scale 1. */
export const TILE_DROP_MS = 300;

export const TILE_DROP_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** How long a tile takes to slide into a new slot. */
export const TILE_MOVE_MS = 230;

export const TILE_MOVE_EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/** Viewport band, in px, that starts a gentle auto-scroll while a tile is lifted. */
export const DRAG_EDGE_PX = 88;

/** Fastest auto-scroll step per frame, at the very edge of the viewport. */
export const DRAG_EDGE_MAX_PX = 8;

/** Transform transition for a FLIP move. None when the user prefers reduced motion. */
export function tileMoveTransition(reduceMotion: boolean): string {
  if (reduceMotion) return 'none';
  return `transform ${TILE_MOVE_MS}ms ${TILE_MOVE_EASE}`;
}

/** Fixed-position overlay origin so the grab point stays under the finger. */
export function dragOverlayPosition(
  clientX: number,
  clientY: number,
  offsetX: number,
  offsetY: number,
): { left: number; top: number } {
  return { left: clientX - offsetX, top: clientY - offsetY };
}

/**
 * Scroll delta for one frame while dragging.
 * Negative moves the page up. Zero when the finger is away from both edges.
 */
export function edgeAutoScrollDelta(
  clientY: number,
  viewportHeight: number,
  edge = DRAG_EDGE_PX,
  maxStep = DRAG_EDGE_MAX_PX,
): number {
  if (viewportHeight <= 0 || edge <= 0 || maxStep <= 0) return 0;
  if (clientY < edge) {
    const t = Math.min(1, (edge - clientY) / edge);
    return -Math.max(1, Math.round(maxStep * t));
  }
  const fromBottom = viewportHeight - clientY;
  if (fromBottom < edge) {
    const t = Math.min(1, (edge - fromBottom) / edge);
    return Math.max(1, Math.round(maxStep * t));
  }
  return 0;
}

/** Keep a programmatic scroll inside the document. */
export function nextLockedScroll(current: number, delta: number, maxScroll: number): number {
  const max = Math.max(0, maxScroll);
  return Math.min(max, Math.max(0, current + delta));
}

/**
 * Layout position of a FLIP-translated element, in viewport coordinates.
 * getBoundingClientRect includes the in-flight translate; the drop target is the slot it is heading to.
 */
export function layoutViewportPoint(
  visualLeft: number,
  visualTop: number,
  translateX: number,
  translateY: number,
): { left: number; top: number } {
  return { left: visualLeft - translateX, top: visualTop - translateY };
}

/** Movement beyond this, before the hold ends, is a native scroll. The pending long-press is cancelled. */
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
