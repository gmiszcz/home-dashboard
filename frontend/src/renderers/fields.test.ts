import { describe, expect, it } from 'vitest';

import { itemKey, safeHref } from './fields';

describe('itemKey', () => {
  it('prefers the id', () => {
    expect(itemKey({ id: 'a', url: 'https://x.example' }, 3)).toBe('a');
  });

  it('falls back to the url, then the headline, then the title', () => {
    expect(itemKey({ url: 'https://x.example', headline: 'H' }, 3)).toBe('https://x.example');
    expect(itemKey({ headline: 'H', title: 'T' }, 3)).toBe('H');
    expect(itemKey({ title: 'T' }, 3)).toBe('T');
  });

  it('uses the index only when the item has nothing to key on', () => {
    expect(itemKey({ priority: 'high' }, 3)).toBe('item-3');
  });
});

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
