import { describe, expect, it } from 'vitest';

import type { SectionUpdate, SocketMessage } from '../types';
import { type DashboardState, applySocketMessage, withMark } from './socketMessage';

function row(section: string, summary = 'x'): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
    section,
    generated_at: '2026-01-01T00:00:00Z',
    summary,
    items: [],
  };
}

function stateOf(sections: SectionUpdate[] = [], marks: [string, string][] = []): DashboardState {
  return { sections, marks: new Map(marks) };
}

describe('applySocketMessage', () => {
  it('replaces every section on a snapshot', () => {
    const next = applySocketMessage(stateOf([row('old')]), { type: 'snapshot', data: [row('a'), row('b')] });
    expect(next.sections.map((s) => s.section).sort()).toEqual(['a', 'b']);
  });

  it('inserts a new section on update', () => {
    const next = applySocketMessage(stateOf([row('a')]), { type: 'update', data: row('b') });
    expect(next.sections.map((s) => s.section).sort()).toEqual(['a', 'b']);
  });

  it('replaces an existing section on update', () => {
    const next = applySocketMessage(stateOf([row('a', 'old')]), { type: 'update', data: row('a', 'new') });
    expect(next.sections).toHaveLength(1);
    expect(next.sections[0].summary).toBe('new');
  });

  it('stores the mark kind on ack', () => {
    const message: SocketMessage = { type: 'ack', data: { section: 'promotions', item_id: '1', kind: 'skipped' } };
    expect(applySocketMessage(stateOf(), message).marks.get('promotions:1')).toBe('skipped');
  });

  it('defaults an ack without kind to a plain ack', () => {
    const message: SocketMessage = { type: 'ack', data: { section: 'ai_daily', item_id: '2' } };
    expect(applySocketMessage(stateOf(), message).marks.get('ai_daily:2')).toBe('ack');
  });

  it('removes the mark on unack', () => {
    const message: SocketMessage = { type: 'unack', data: { section: 'ai_daily', item_id: '2' } };
    const next = applySocketMessage(stateOf([], [['ai_daily:2', 'ack']]), message);
    expect(next.marks.has('ai_daily:2')).toBe(false);
  });

  it.each<SocketMessage>([{ type: 'ping' }, { type: 'reload' }])('leaves the state alone on $type', (message) => {
    const state = stateOf([row('a')], [['a:1', 'ack']]);
    expect(applySocketMessage(state, message)).toBe(state);
  });

  it('leaves the state alone on an unknown type', () => {
    const state = stateOf([row('a')]);
    const unknown = { type: 'future' } as unknown as SocketMessage;
    expect(applySocketMessage(state, unknown)).toBe(state);
  });

  it('does not mutate the previous marks', () => {
    const state = stateOf();
    applySocketMessage(state, { type: 'ack', data: { section: 's', item_id: 'i' } });
    expect(state.marks.size).toBe(0);
  });
});

describe('withMark', () => {
  it('sets and removes a key on a copy', () => {
    const base = new Map([['a', 'ack']]);
    expect(withMark(base, 'b', 'skipped').get('b')).toBe('skipped');
    expect(withMark(base, 'a', undefined).has('a')).toBe(false);
    expect(base.has('a')).toBe(true);
  });
});
