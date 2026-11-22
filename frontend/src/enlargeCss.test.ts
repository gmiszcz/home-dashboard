import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('expanded tile text', () => {
  it('lets long names wrap instead of clipping', () => {
    const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');
    const rule = css.match(/\.enlarge-body \.receipt-sub-name[^{]*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('white-space: normal');
    expect(rule![1]).toContain('overflow: visible');
  });

  it('also unclips expense line labels and offer descriptions', () => {
    const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8').replace(/\r\n/g, '\n');
    const rule = css.match(/\.enlarge-body \.receipt-sub-name,[^{]*\.enlarge-body \.expense-line-label[^{]*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('white-space: normal');
    expect(css).toMatch(/\.enlarge-body \.offer-sub \{[^}]*-webkit-line-clamp: unset/);
  });
});
