import { markKey } from './marks';
import { ackFamilySections } from './sections';

/** Mark keys that an ack on `itemId` touches across the section's ack family. */
export function familyAckKeys(section: string, itemId: string): string[] {
  return ackFamilySections(section).map((member) => markKey(member, itemId));
}

/** Whether `itemId` is acked in any member of the section's ack family. */
export function isAckedInFamily(
  section: string,
  itemId: string,
  has: (key: string) => boolean,
): boolean {
  return familyAckKeys(section, itemId).some(has);
}
