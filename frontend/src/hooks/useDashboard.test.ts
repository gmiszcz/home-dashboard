import { describe, expect, it } from 'vitest';

import { shouldNightlyReload } from './useDashboard';

type DateParts = [number, number, number, number, number, number];

// Local-time constructor, because the reload boundary is the local 04:00.
describe('shouldNightlyReload', () => {
  it.each<[string, DateParts, DateParts, boolean]>([
    ['loaded yesterday afternoon, now just after 04:00', [2026, 9, 29, 15, 0, 0], [2026, 9, 30, 4, 0, 30], true],
    ['loaded after 04:00 today, now 04:05', [2026, 9, 30, 4, 0, 31], [2026, 9, 30, 4, 5, 0], false],
    ['loaded yesterday 05:00, now 03:59', [2026, 9, 29, 5, 0, 0], [2026, 9, 30, 3, 59, 0], false],
    ['loaded 03:59, now exactly 04:00', [2026, 9, 30, 3, 59, 0], [2026, 9, 30, 4, 0, 0], true],
    ['loaded two days ago, now midday', [2026, 9, 28, 9, 0, 0], [2026, 9, 30, 12, 0, 0], true],
  ])('%s', (_name, loaded, now, expected) => {
    const result = shouldNightlyReload(new Date(...loaded), new Date(...now));
    expect(result).toBe(expected);
  });
});
