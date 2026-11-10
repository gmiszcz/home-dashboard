import { describe, expect, it } from 'vitest';

import { TILE_MOVE_EASE, TILE_MOVE_MS, TILE_PICKUP_MS, longPressMovedTooFar, tileMoveTransition } from './longPressDrag';

describe('longPressMovedTooFar', () => {
  it('treats a small jitter as a hold', () => {
    expect(longPressMovedTooFar(3, 4)).toBe(false);
    expect(longPressMovedTooFar(0, 0)).toBe(false);
  });

  it('treats a real move as scrolling, not a drag', () => {
    expect(longPressMovedTooFar(12, 0)).toBe(true);
    expect(longPressMovedTooFar(0, 20)).toBe(true);
  });
});

describe('tileMoveTransition', () => {
  it('slides over about a quarter second with a smooth ease', () => {
    expect(TILE_MOVE_MS).toBeGreaterThanOrEqual(200);
    expect(TILE_MOVE_MS).toBeLessThanOrEqual(250);
    expect(TILE_PICKUP_MS).toBe(280);
    expect(tileMoveTransition(false)).toBe(`transform ${TILE_MOVE_MS}ms ${TILE_MOVE_EASE}`);
  });

  it('does not animate when reduced motion is requested', () => {
    expect(tileMoveTransition(true)).toBe('none');
  });
});
