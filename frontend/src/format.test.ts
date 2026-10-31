import { describe, expect, it } from 'vitest';

import { addDaysKey, dataFreshness, FRESHNESS_LABELS, formatRelative, plural } from './format';

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

describe('dataFreshness', () => {
  it.each([
    ['same instant', '2026-10-30T12:00:00+01:00', '2026-10-30T12:00:00+01:00', 'today'],
    ['earlier the same day', '2026-10-30T00:00:00+01:00', '2026-10-30T23:59:00+01:00', 'today'],
    ['just before midnight, one minute ago', '2026-10-29T23:59:00+01:00', '2026-10-30T00:00:00+01:00', 'yesterday'],
    ['previous day, 12 h ago', '2026-10-29T20:00:00+01:00', '2026-10-30T08:00:00+01:00', 'yesterday'],
    ['exactly 24 h ago', '2026-10-29T12:00:00+01:00', '2026-10-30T12:00:00+01:00', 'yesterday'],
    ['24 h and one second ago', '2026-10-29T11:59:59+01:00', '2026-10-30T12:00:00+01:00', 'old'],
    ['three days ago', '2026-10-27T12:00:00+01:00', '2026-10-30T12:00:00+01:00', 'old'],
    ['timestamp slightly in the future', '2026-10-30T12:01:00+01:00', '2026-10-30T12:00:00+01:00', 'today'],
  ])('%s', (_name, value, now, expected) => {
    expect(dataFreshness(value, new Date(now))).toBe(expected);
  });

  it('uses the Warsaw calendar day, not UTC', () => {
    // 23:30 UTC on Oct 29 is 00:30 on Oct 30 in Warsaw (CET).
    expect(dataFreshness('2026-10-29T23:30:00Z', new Date('2026-10-30T10:00:00Z'))).toBe('today');
  });

  it('measures 24 h by elapsed time across the autumn clock change', () => {
    // Warsaw leaves summer time on 2026-10-25, so wall clocks 13:00 CEST and 12:00 CET are exactly 24 h apart.
    const now = new Date('2026-10-25T12:00:00+01:00');
    expect(dataFreshness('2026-10-24T13:00:00+02:00', now)).toBe('yesterday');
    expect(dataFreshness('2026-10-24T11:30:00+02:00', now)).toBe('old');
  });

  it('parses server timestamps without a zone as UTC', () => {
    expect(dataFreshness('2026-10-30 10:00:00', new Date('2026-10-30T11:00:00Z'))).toBe('today');
  });

  it('returns unknown for an unparseable value', () => {
    expect(dataFreshness('not a date', NOW)).toBe('unknown');
  });

  it('has a Polish label for every level', () => {
    expect(FRESHNESS_LABELS).toEqual({
      today: 'Dane z dziś',
      yesterday: 'Dane z wczoraj',
      old: 'Dane starsze niż 24 h',
      unknown: 'Nieznana data danych',
    });
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
