import { describe, expect, it } from 'vitest';

import {
  TILE_DROP_MS,
  TILE_MOVE_EASE,
  TILE_MOVE_MS,
  TILE_PICKUP_HOLD,
  TILE_PICKUP_MS,
  TILE_PICKUP_PEAK,
  dragOverlayPosition,
  edgeAutoScrollDelta,
  layoutViewportPoint,
  longPressMovedTooFar,
  nextLockedScroll,
  scrollDeltaForFinger,
  tileMoveTransition,
} from './longPressDrag';

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
    expect(TILE_PICKUP_MS).toBe(500);
    expect(TILE_PICKUP_PEAK).toBe(1.04);
    expect(TILE_PICKUP_HOLD).toBe(1.02);
    expect(TILE_DROP_MS).toBe(300);
    expect(tileMoveTransition(false)).toBe(`transform ${TILE_MOVE_MS}ms ${TILE_MOVE_EASE}`);
  });

  it('does not animate when reduced motion is requested', () => {
    expect(tileMoveTransition(true)).toBe('none');
  });
});

describe('scrollDeltaForFinger', () => {
  it('scrolls the page with the finger before a tile is lifted', () => {
    expect(scrollDeltaForFinger(100, 160)).toBe(-60);
    expect(scrollDeltaForFinger(160, 100)).toBe(60);
  });
});

describe('dragOverlayPosition', () => {
  it('keeps the grab point under the finger', () => {
    expect(dragOverlayPosition(120, 80, 30, 10)).toEqual({ left: 90, top: 70 });
  });
});

describe('edgeAutoScrollDelta', () => {
  it('does not scroll while the finger is in the middle of the screen', () => {
    expect(edgeAutoScrollDelta(400, 800)).toBe(0);
    expect(edgeAutoScrollDelta(88, 800)).toBe(0);
  });

  it('scrolls gently, faster as the finger reaches the edge', () => {
    expect(edgeAutoScrollDelta(0, 800)).toBe(-8);
    expect(edgeAutoScrollDelta(44, 800)).toBe(-4);
    expect(edgeAutoScrollDelta(800, 800)).toBe(8);
    expect(edgeAutoScrollDelta(756, 800)).toBe(4);
  });
});

describe('nextLockedScroll', () => {
  it('clamps the auto-scroll to the document', () => {
    expect(nextLockedScroll(10, -8, 400)).toBe(2);
    expect(nextLockedScroll(0, -8, 400)).toBe(0);
    expect(nextLockedScroll(396, 8, 400)).toBe(400);
  });
});

describe('layoutViewportPoint', () => {
  it('removes an in-flight FLIP translate so the drop aims at the slot', () => {
    expect(layoutViewportPoint(140, 320, 40, -15)).toEqual({ left: 100, top: 335 });
  });
});
