import type { AckRecord } from './types';

/** Mark kind for an item the user is not interested in (promotions). */
export const SKIPPED_KIND = 'skipped';

/** Mark kind for an acknowledged ("read") item. The server uses it when no kind is given. */
export const ACK_KIND = 'ack';

/** Map key of an item mark: section and item id. */
export function markKey(section: string, itemId: string): string {
  return `${section}:${itemId}`;
}

/** Item marks by `markKey`, built from the server list. A record without a kind is a plain ack. */
export function marksFromAcks(acks: AckRecord[]): Map<string, string> {
  return new Map(acks.map((ack) => [markKey(ack.section, ack.item_id), ack.kind ?? ACK_KIND]));
}
