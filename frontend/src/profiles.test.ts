import { describe, expect, it } from 'vitest';

import {
  effectiveProfiles,
  isSharedTile,
  layoutOrderKey,
  layoutWidthKey,
  tileMatchesProfile,
} from './profiles';
import type { SectionUpdate } from './types';

function tile(section: string, profiles?: string[]): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-10T10:00:00+01:00',
    schema_version: 1,
    section,
    generated_at: '2026-11-10T10:00:00+01:00',
    profiles,
    items: [],
  };
}

describe('effective profiles', () => {
  it('defaults a tile with no profiles field to Patryk', () => {
    const update = tile('parcels');
    expect(effectiveProfiles(update, {})).toEqual(['patryk']);
    expect(tileMatchesProfile(update, {}, 'patryk')).toBe(true);
    expect(tileMatchesProfile(update, {}, 'ola')).toBe(false);
    expect(isSharedTile(update, {})).toBe(false);
  });

  it('reads the payload and treats both names as shared, in either order', () => {
    const ola = tile('job_offers', ['ola']);
    expect(effectiveProfiles(ola, {})).toEqual(['ola']);
    expect(tileMatchesProfile(ola, {}, 'ola')).toBe(true);
    expect(tileMatchesProfile(ola, {}, 'patryk')).toBe(false);

    const shared = tile('calendar', ['ola', 'patryk']);
    expect(effectiveProfiles(shared, {})).toEqual(['patryk', 'ola']);
    expect(isSharedTile(shared, {})).toBe(true);
    expect(tileMatchesProfile(shared, {}, 'patryk')).toBe(true);
    expect(tileMatchesProfile(shared, {}, 'ola')).toBe(true);
  });

  it('ignores an empty or unknown payload list and keeps the Patryk default', () => {
    expect(effectiveProfiles(tile('notes', []), {})).toEqual(['patryk']);
    expect(effectiveProfiles(tile('notes', ['zenek']), {})).toEqual(['patryk']);
  });

  it('lets the server map override the payload, and falls through when the entry is empty', () => {
    const update = tile('calendar', ['patryk']);
    expect(effectiveProfiles(update, { calendar: ['ola'] })).toEqual(['ola']);
    expect(isSharedTile(update, { calendar: ['patryk', 'ola'] })).toBe(true);
    expect(effectiveProfiles(update, { calendar: [] })).toEqual(['patryk']);
    expect(effectiveProfiles(update, { parcels: ['ola'] })).toEqual(['patryk']);
  });

  it('keeps Patryk on the existing layout keys and gives Ola her own', () => {
    expect(layoutOrderKey('patryk')).toBe('dashboard_custom_order');
    expect(layoutWidthKey('patryk')).toBe('dashboard_custom_widths');
    expect(layoutOrderKey('ola')).toBe('dashboard_custom_order_ola');
    expect(layoutWidthKey('ola')).toBe('dashboard_custom_widths_ola');
  });
});
