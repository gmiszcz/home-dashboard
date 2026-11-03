import { describe, expect, it } from 'vitest';

import { familyAckKeys, isAckedInFamily } from './aiAck';
import { markKey } from './marks';

describe('familyAckKeys', () => {
  it('returns both AI section keys for an AI section', () => {
    expect(familyAckKeys('ai_daily', 'art-1')).toEqual([
      markKey('ai_daily', 'art-1'),
      markKey('ai_weekly', 'art-1'),
    ]);
  });

  it('returns a single key for a non-AI section', () => {
    expect(familyAckKeys('job_offers', 'job-1')).toEqual([markKey('job_offers', 'job-1')]);
  });
});

describe('isAckedInFamily', () => {
  it('reads an AI article as acked when only the other AI section holds the mark', () => {
    const acked = new Set([markKey('ai_weekly', 'art-1')]);
    expect(isAckedInFamily('ai_daily', 'art-1', (key) => acked.has(key))).toBe(true);
  });

  it('matches a job_offers id only against its own key', () => {
    const acked = new Set([markKey('ai_daily', 'job-1')]);
    expect(isAckedInFamily('job_offers', 'job-1', (key) => acked.has(key))).toBe(false);
  });

  it('is false when no family member holds the mark', () => {
    expect(isAckedInFamily('ai_daily', 'art-1', () => false)).toBe(false);
  });
});
