import { describe, expect, it } from 'vitest';

import { longPressMovedTooFar } from './longPressDrag';

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
