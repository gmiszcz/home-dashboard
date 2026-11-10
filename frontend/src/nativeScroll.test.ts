import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LONG_PRESS_SLOP_PX } from './longPressDrag';

const src = dirname(fileURLToPath(import.meta.url));

describe('native scroll before a long-press', () => {
  const css = readFileSync(join(src, 'index.css'), 'utf8');
  const grid = readFileSync(join(src, 'components/SectionGrid.tsx'), 'utf8');
  const main = readFileSync(join(src, 'main.tsx'), 'utf8');

  it('lets a tile pan vertically until a drag starts', () => {
    const at = css.indexOf('.card-wrapper {');
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toContain('touch-action: pan-y');
    expect(block).not.toContain('touch-action: none');
    expect(LONG_PRESS_SLOP_PX).toBeGreaterThanOrEqual(8);
    expect(LONG_PRESS_SLOP_PX).toBeLessThanOrEqual(10);
  });

  it('locks panning only while a tile is lifted', () => {
    expect(css).toMatch(/html\.is-tile-dragging,\s*html\.is-tile-dragging body \{[^}]*touch-action:\s*none/);
    expect(grid).toContain("node.style.setProperty('touch-action', 'none')");
    expect(grid).toContain("document.documentElement.classList.add('is-tile-dragging')");
  });

  it('does not emulate scrolling, and preventDefault waits until the tile is lifted', () => {
    expect(grid).not.toContain('scrollBy');
    expect(grid).not.toContain('scrollDeltaForFinger');
    // Chrome only delivers touchmove to listeners that exist at touchstart. The listener
    // is non-passive so a later preventDefault still works, and it does not call
    // preventDefault until dragActiveRef is set.
    expect(grid).toContain('onWatchTouch, { passive: false, capture: true }');
    expect(grid).toContain('if (touchEvent.cancelable) touchEvent.preventDefault()');
    expect(grid).toMatch(/if \(dragActiveRef\.current\) \{\s*if \(touchEvent\.cancelable\) touchEvent\.preventDefault\(\)/);
    expect(main).not.toContain('passive: false');
  });
});
