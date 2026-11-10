import { describe, expect, it } from 'vitest';

import type { SectionUpdate } from '../types';
import { chartLines, formatShare, linesTotal, monthLabel, readPayslip } from './payslip';

function update(extra: Record<string, unknown>, items: SectionUpdate['items'] = []): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-10T10:23:00+01:00',
    schema_version: 2,
    section: 'payslip',
    generated_at: '2026-11-10T10:23:00+01:00',
    items,
    extra,
  };
}

const OCTOBER = {
  currency: 'PLN',
  month: '2026-10',
  gross: 17888.13,
  net: 8606.34,
  deductions_total: 9340.29,
  components: [
    { code: 'net', label: 'Na konto', group: 'net', amount: 8606.34 },
    { code: 'pit', label: 'PIT', group: 'pit', amount: 4638 },
    { code: 'emerytalna', label: 'Emerytalna', group: 'zus', amount: 1747.83 },
    { code: 'rentowa', label: 'Rentowa', group: 'zus', amount: 268.62 },
    { code: 'chorobowa', label: 'Chorobowa', group: 'zus', amount: 438.75 },
    { code: 'zdrowotna', label: 'Zdrowotna', group: 'zdrowotna', amount: 1390.76 },
    { code: 'ppk', label: 'PPK', group: 'ppk', amount: 358.16 },
    { code: 'zfss', label: 'ZFŚS', group: 'zfss', amount: 466.67 },
    { code: 'medicover', label: 'MedicoverSport', group: 'other', amount: 31.5 },
    { code: 'premia', label: 'Premia', group: 'addition', amount: 2981.36 },
    { code: 'home_office', label: 'Home office', group: 'addition', amount: 58.5 },
  ],
  previous_month: null,
  history: [{ month: '2026-10', gross: 17888.13, net: 8606.34 }],
  diff_vs_previous: null,
};

describe('readPayslip', () => {
  it('reads the October 2026 split and keeps additions off the donut', () => {
    const model = readPayslip(update(OCTOBER));
    expect(model.current.gross).toBe(17888.13);
    expect(model.current.net).toBe(8606.34);
    expect(model.previous).toBeNull();
    expect(model.diffs).toEqual([]);
    expect(monthLabel(model.current.month)).toBe('paź 2026');

    const donut = chartLines(model.current.lines, 'donut');
    const bars = chartLines(model.current.lines, 'bar');
    expect(donut.map((line) => line.code)).not.toContain('premia');
    expect(bars.map((line) => line.code)).toEqual([
      'net',
      'pit',
      'emerytalna',
      'rentowa',
      'chorobowa',
      'zdrowotna',
      'ppk',
      'zfss',
      'medicover',
      'premia',
      'home_office',
    ]);
    expect(linesTotal(donut)).toBe(17946.63);
    expect(formatShare(8606.34, 17888.13)).toBe('48,1%');
  });

  it('builds month-over-month diffs from the previous payslip', () => {
    const model = readPayslip(
      update({
        ...OCTOBER,
        previous_month: {
          month: '2026-09',
          gross: 17000,
          net: 8200,
          components: [
            { code: 'net', label: 'Na konto', group: 'net', amount: 8200 },
            { code: 'pit', label: 'PIT', group: 'pit', amount: 4400 },
          ],
        },
        diff_vs_previous: { gross: 888.13, pit: 238 },
      }),
    );
    expect(model.previous?.month).toBe('2026-09');
    expect(model.diffs.find((row) => row.key === 'gross')?.diff).toBe(888.13);
    expect(model.diffs.find((row) => row.key === 'pit')?.diff).toBe(238);
    expect(model.diffs.find((row) => row.key === 'net')?.diff).toBe(406.34);
  });
});
