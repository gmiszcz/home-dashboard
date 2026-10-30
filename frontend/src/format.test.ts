import { describe, expect, it } from 'vitest';

import { addDaysKey, formatRelative, plural } from './format';

const NOW = new Date('2026-10-30T12:00:00+01:00');

function minutesFromNow(minutes: number): string {
  return new Date(NOW.getTime() + minutes * 60_000).toISOString();
}

describe('formatRelative', () => {
  it.each([
    [-0.4, 'przed chwilą'],
    [-1, '1 minutę temu'],
    [-2, '2 minuty temu'],
    [-5, '5 minut temu'],
    [120, 'za 2 godziny'],
    [-24 * 60, '1 dzień temu'],
  ])('formats %s minutes from now as "%s"', (minutes, expected) => {
    expect(formatRelative(minutesFromNow(minutes), NOW)).toBe(expected);
  });

  it('returns an empty string for an unparseable value', () => {
    expect(formatRelative('not a date', NOW)).toBe('');
  });
});

describe('plural', () => {
  it.each([
    [1, 'pozycja'],
    [2, 'pozycje'],
    [3, 'pozycje'],
    [4, 'pozycje'],
    [22, 'pozycje'],
    [5, 'pozycji'],
    [12, 'pozycji'],
    [13, 'pozycji'],
    [14, 'pozycji'],
    [25, 'pozycji'],
  ])('uses the right form for %s', (count, expected) => {
    expect(plural(count, 'pozycja', 'pozycje', 'pozycji')).toBe(expected);
  });
});

describe('addDaysKey', () => {
  it('rolls over the end of a month', () => {
    expect(addDaysKey('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('goes back across a month boundary', () => {
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});
