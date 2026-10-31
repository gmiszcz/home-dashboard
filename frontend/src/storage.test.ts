import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { read, readBool, readEnum, readJson, remove, write } from './storage';

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

function stubThrowingStorage(): void {
  const fail = () => {
    throw new Error('storage blocked');
  };
  vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage with a working localStorage', () => {
  let data: Map<string, string>;

  beforeEach(() => {
    data = stubStorage({ flag: 'true', off: '0', json: '{"a":1}', bad: '{nope', mode: 'full', odd: 'weird' });
  });

  it('reads a stored string and null for a missing key', () => {
    expect(read('mode')).toBe('full');
    expect(read('missing')).toBeNull();
  });

  it('reads booleans in both stored formats and falls back otherwise', () => {
    expect(readBool('flag', false)).toBe(true);
    expect(readBool('off', true)).toBe(false);
    expect(readBool('missing', true)).toBe(true);
    expect(readBool('odd', false)).toBe(false);
  });

  it('parses JSON and returns null for missing or invalid JSON', () => {
    expect(readJson<{ a: number }>('json')).toEqual({ a: 1 });
    expect(readJson('bad')).toBeNull();
    expect(readJson('missing')).toBeNull();
  });

  it('accepts only allowed enum values', () => {
    expect(readEnum('mode', ['simple', 'full'] as const, 'simple')).toBe('full');
    expect(readEnum('odd', ['simple', 'full'] as const, 'simple')).toBe('simple');
    expect(readEnum('missing', ['simple', 'full'] as const, 'simple')).toBe('simple');
  });

  it('writes and removes a key', () => {
    write('k', 'v');
    expect(data.get('k')).toBe('v');
    remove('k');
    expect(data.has('k')).toBe(false);
  });
});

describe('storage with a throwing localStorage', () => {
  beforeEach(stubThrowingStorage);

  it('returns defaults instead of throwing', () => {
    expect(read('k')).toBeNull();
    expect(readBool('k', true)).toBe(true);
    expect(readJson('k')).toBeNull();
    expect(readEnum('k', ['a', 'b'] as const, 'b')).toBe('b');
  });

  it('ignores write and remove failures', () => {
    expect(() => write('k', 'v')).not.toThrow();
    expect(() => remove('k')).not.toThrow();
  });
});
