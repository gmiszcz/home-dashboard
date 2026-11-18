import { describe, expect, it } from 'vitest';

import { hrefWithTile, resolveIsolatedTile, tileParam } from './isolate';

describe('isolate tile address', () => {
  it('reads the tile query and ignores a blank value', () => {
    expect(tileParam('?tile=czynsz')).toBe('czynsz');
    expect(tileParam('tile=prad&token=abc')).toBe('prad');
    expect(tileParam('?tile=%20')).toBeNull();
    expect(tileParam('')).toBeNull();
  });

  it('sets and clears the tile parameter without dropping the hash', () => {
    expect(hrefWithTile('/pulpit?token=abc#top', 'czynsz')).toBe('/pulpit?token=abc&tile=czynsz#top');
    expect(hrefWithTile('/pulpit?tile=czynsz&token=abc', null)).toBe('/pulpit?token=abc');
  });

  it('drops an isolated tile that is no longer in the payload', () => {
    expect(resolveIsolatedTile('czynsz', null)).toBe('czynsz');
    expect(resolveIsolatedTile('czynsz', ['czynsz', 'parcels'])).toBe('czynsz');
    expect(resolveIsolatedTile('gone', ['czynsz'])).toBeNull();
    expect(resolveIsolatedTile(null, ['czynsz'])).toBeNull();
  });
});
