import { describe, expect, it } from 'vitest';

import { ACK_KIND, markKey, marksFromAcks, SKIPPED_KIND } from './marks';

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
