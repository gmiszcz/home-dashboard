import { ACK_KIND, markKey } from '../marks';
import { sectionRank } from '../sections';
import type { SectionUpdate, SocketMessage } from '../types';

/** Server-driven dashboard state: latest section rows and item marks ("section:id" -> kind). */
export interface DashboardState {
  sections: SectionUpdate[];
  marks: Map<string, string>;
}

/** Sections ordered by display rank, then by Polish-locale name. */
export function sortSections(rows: SectionUpdate[]): SectionUpdate[] {
  return [...rows].sort((left, right) => {
    const rank = sectionRank(left.section, left) - sectionRank(right.section, right);
    if (rank !== 0) return rank;
    return left.section.localeCompare(right.section, 'pl');
  });
}

function upsert(current: SectionUpdate[], row: SectionUpdate): SectionUpdate[] {
  const next = current.filter((item) => item.section !== row.section);
  next.push(row);
  return sortSections(next);
}

/** Copy of `marks` with `key` set to `kind`, or removed when `kind` is undefined. */
export function withMark(marks: Map<string, string>, key: string, kind: string | undefined): Map<string, string> {
  const next = new Map(marks);
  if (kind === undefined) next.delete(key);
  else next.set(key, kind);
  return next;
}

/**
 * Pure state transition for one WebSocket message.
 * `reload` and `ping` leave the state alone: the hook performs the page reload itself.
 */
export function applySocketMessage(state: DashboardState, message: SocketMessage): DashboardState {
  switch (message.type) {
    case 'snapshot':
      return { ...state, sections: sortSections(message.data) };
    case 'update':
      return { ...state, sections: upsert(state.sections, message.data) };
    case 'ack': {
      const key = markKey(message.data.section, message.data.item_id);
      return { ...state, marks: withMark(state.marks, key, message.data.kind ?? ACK_KIND) };
    }
    case 'unack': {
      const key = markKey(message.data.section, message.data.item_id);
      return { ...state, marks: withMark(state.marks, key, undefined) };
    }
    case 'reload':
    case 'ping':
      return state;
    default: {
      // A compile error here means a new SocketMessage variant is not handled above.
      const unhandled: never = message;
      void unhandled;
      return state;
    }
  }
}
