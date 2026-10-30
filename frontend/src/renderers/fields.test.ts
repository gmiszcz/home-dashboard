import { describe, expect, it } from 'vitest';

import { safeHref } from './fields';

describe('safeHref', () => {
  it.each(['https://example.com/a', 'http://example.com/a'])('keeps %s', (href) => {
    expect(safeHref(href)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,x',
    'ftp://example.com/file',
    'not a url',
    null,
  ])('rejects %s', (href) => {
    expect(safeHref(href)).toBeNull();
  });
});
