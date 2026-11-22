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
});
