import { describe, expect, it } from 'vitest';

import {
  ACK_KIND,
  markKey,
  marksFromAcks,
  SEEN_KIND,
  SEEN_SECTION,
  seenFromMarks,
  seenItemId,
  SKIPPED_KIND,
} from './marks';

describe('marksFromAcks', () => {
  it('maps section and item id to the kind', () => {
    const marks = marksFromAcks([
      { section: 'promotions', item_id: 'p1', acked_at: 'x', kind: SKIPPED_KIND },
      { section: 'security_alerts', item_id: 'a1', acked_at: 'x', kind: ACK_KIND },
    ]);
    expect(marks.get(markKey('promotions', 'p1'))).toBe('skipped');
    expect(marks.get(markKey('security_alerts', 'a1'))).toBe('ack');
  });

  it('treats a record without a kind as a plain ack', () => {
    const marks = marksFromAcks([{ section: 'parcels', item_id: 'x', acked_at: 'x' }]);
    expect(marks.get(markKey('parcels', 'x'))).toBe(ACK_KIND);
  });
});

describe('seenItemId', () => {
  it('encodes the real section and the content fingerprint', () => {
    expect(seenItemId('ai_daily', 'abc')).toBe('ai_daily:abc');
  });
});

describe('seenFromMarks', () => {
  function withSeen(section: string, fingerprint: string): [string, string] {
    return [markKey(SEEN_SECTION, seenItemId(section, fingerprint)), SEEN_KIND];
  }

  it('recovers the acknowledged fingerprint per section', () => {
    const marks = new Map([withSeen('ai_daily', 'abc')]);
    expect(seenFromMarks(marks)).toEqual({ ai_daily: 'abc' });
  });

  it('ignores plain ack and skipped marks', () => {
    const marks = new Map<string, string>([
      [markKey('ai_daily', 'art-1'), ACK_KIND],
      [markKey('promotions', 'p1'), SKIPPED_KIND],
      withSeen('ai_weekly', 'xyz'),
    ]);
    expect(seenFromMarks(marks)).toEqual({ ai_weekly: 'xyz' });
  });

  it('collects every seen section', () => {
    const marks = new Map([withSeen('ai_daily', 'd1'), withSeen('parcels', 'p9')]);
    expect(seenFromMarks(marks)).toEqual({ ai_daily: 'd1', parcels: 'p9' });
  });

  it('round-trips a fingerprint that itself contains no extra colon', () => {
    const fingerprint = contentLikeFingerprint();
    const marks = new Map([withSeen('calendar', fingerprint)]);
    expect(seenFromMarks(marks)).toEqual({ calendar: fingerprint });
  });
});

/** A base36 token like contentFingerprint produces (no colon). */
function contentLikeFingerprint(): string {
  return (123456789 >>> 0).toString(36);
}

describe('seen merge precedence (grid effective map)', () => {
  // The grid computes effective seen as { ...baseline, ...serverSeen }.
  const merge = (baseline: Record<string, string>, server: Record<string, string>) => ({
    ...baseline,
    ...server,
  });

  it('server seen overrides the device baseline for the same section', () => {
    const baseline = { ai_daily: 'old', job_offers: 'base' };
    const server = seenFromMarks(new Map([[markKey(SEEN_SECTION, seenItemId('ai_daily', 'new')), SEEN_KIND]]));
    expect(merge(baseline, server)).toEqual({ ai_daily: 'new', job_offers: 'base' });
  });

  it('keeps baseline-only sections when the server has no mark for them', () => {
    const baseline = { parcels: 'base' };
    expect(merge(baseline, seenFromMarks(new Map()))).toEqual({ parcels: 'base' });
  });

  it('falls back to the baseline fingerprint after a server unack removes the seen row', () => {
    const baseline = { ai_daily: 'base' };
    // After an unack the seen row is gone, so the server map is empty and the baseline shows.
    const effective = merge(baseline, seenFromMarks(new Map()));
    // A tile is "fresh" when its current fingerprint differs from the effective one.
    expect(effective.ai_daily).toBe('base');
    expect(effective.ai_daily).not.toBe('changed-content');
  });
});
