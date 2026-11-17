import { describe, expect, it } from 'vitest';

import type { SectionUpdate } from './types';
import { isSectionConcealed, isTileHidden, parseHiddenOverrides, payloadHidden } from './visibility';

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

  it('conceals a tile the bot hid, even when display.hidden is off', () => {
    const named = update('prad');
    expect(isSectionConcealed(named, new Set(['prad']))).toBe(true);
    expect(isSectionConcealed({ ...named, hidden: true }, new Set())).toBe(true);
    expect(isSectionConcealed(update('payslip', true), new Set())).toBe(false);
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
