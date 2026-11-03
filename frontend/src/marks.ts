import type { AckRecord } from './types';

/** Mark kind for an item the user is not interested in (promotions). */
export const SKIPPED_KIND = 'skipped';

/** Mark kind for a job offer the user is not interested in. Hides that single offer. */
export const NOT_INTERESTED_KIND = 'not_interested';

/** Mark kind for an acknowledged ("read") item. The server uses it when no kind is given. */
export const ACK_KIND = 'ack';

/**
 * Mark kind and synthetic section for the per-tile "Ogarnięte" acknowledgement.
 * The row lives in the shared `acks` table under section `seen` so it persists and
 * syncs across devices without a schema change. Its item id encodes the real section
 * and the acknowledged content fingerprint (see `seenItemId`).
 */
export const SEEN_KIND = 'seen';
export const SEEN_SECTION = 'seen';

/** Map key of an item mark: section and item id. */
export function markKey(section: string, itemId: string): string {
  return `${section}:${itemId}`;
}

/** Item marks by `markKey`, built from the server list. A record without a kind is a plain ack. */
export function marksFromAcks(acks: AckRecord[]): Map<string, string> {
  return new Map(acks.map((ack) => [markKey(ack.section, ack.item_id), ack.kind ?? ACK_KIND]));
}

/** Item id of a "seen" mark: the real section and its acknowledged content fingerprint. */
export function seenItemId(section: string, fingerprint: string): string {
  return `${section}:${fingerprint}`;
}

/**
 * Acknowledged content fingerprint per section, read from the shared marks map.
 * Scans keys of the form `seen:<section>:<fingerprint>` whose kind is `seen`, and
 * recovers the real section and fingerprint from the item id. The map key prefix is
 * `markKey(SEEN_SECTION, '')` (i.e. `seen:`), and the remainder is the item id, which
 * itself is `<section>:<fingerprint>`, so only the first colon of the item id splits it.
 */
export function seenFromMarks(marks: Map<string, string>): Record<string, string> {
  const prefix = markKey(SEEN_SECTION, '');
  const result: Record<string, string> = {};
  for (const [key, kind] of marks) {
    if (kind !== SEEN_KIND || !key.startsWith(prefix)) continue;
    const itemId = key.slice(prefix.length);
    const split = itemId.indexOf(':');
    if (split <= 0) continue;
    const section = itemId.slice(0, split);
    const fingerprint = itemId.slice(split + 1);
    if (fingerprint) result[section] = fingerprint;
  }
  return result;
}
