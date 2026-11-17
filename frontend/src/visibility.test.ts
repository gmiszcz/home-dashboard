import { describe, expect, it } from 'vitest';

import type { SectionUpdate } from './types';
import { isBoardHidden, isTileHidden, parseHiddenOverrides, payloadHidden, tileMarkedHidden } from './visibility';

function update(section: string, hidden?: boolean): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-10T10:23:00+01:00',
    schema_version: 2,
    section,
    generated_at: '2026-11-10T10:23:00+01:00',
    display: hidden === undefined ? {} : { hidden },
    items: [],
  };
}

describe('hidden tiles', () => {
  it('follows display.hidden when the device has no override', () => {
    expect(payloadHidden(update('payslip', true))).toBe(true);
    expect(isTileHidden(update('payslip', true), {})).toBe(true);
    expect(isTileHidden(update('parcels'), {})).toBe(false);
    expect(isTileHidden(update('parcels', false), {})).toBe(false);
  });

  it('lets a local override show a hidden tile or hide a public one', () => {
    expect(isTileHidden(update('payslip', true), { payslip: false })).toBe(false);
    expect(isTileHidden(update('parcels', false), { parcels: true })).toBe(true);
  });

  it('hides a tile from the hidden-sections list, from hidden: true, and from display.hidden', () => {
    const listed = new Set(['expenses_weekly', 'expenses_monthly', 'finance', 'payslip', 'prad', 'subscriptions', 'spoldzielnia']);
    for (const name of listed) {
      expect(tileMarkedHidden(update(name), listed)).toBe(true);
      expect(isBoardHidden(update(name), listed, false)).toBe(true);
      expect(isBoardHidden(update(name), listed, true)).toBe(false);
    }
    const flagged = { ...update('rachunki'), hidden: true };
    expect(isBoardHidden(flagged, new Set(), false)).toBe(true);
    expect(isBoardHidden(flagged, new Set(), true)).toBe(false);
    expect(isBoardHidden(update('payslip', true), new Set(), false)).toBe(true);
    expect(isBoardHidden(update('payslip', true), new Set(), true)).toBe(false);
    expect(isBoardHidden(update('parcels'), listed, false)).toBe(false);
  });

  it('reads only boolean overrides from storage', () => {
    expect(parseHiddenOverrides(null)).toEqual({});
    expect(parseHiddenOverrides('not json')).toEqual({});
    expect(parseHiddenOverrides('{"payslip":false,"parcels":true,"notes":"x"}')).toEqual({
      payslip: false,
      parcels: true,
    });
  });
});
