import { describe, expect, it } from 'vitest';

import { formatExpenseTotal, isExpensesTile, readExpensesTile } from './expensesTile';
import type { SectionUpdate } from './types';

function update(extra: Partial<SectionUpdate>): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-12T17:00:00Z',
    schema_version: 1,
    section: 'rachunki',
    generated_at: '2026-11-12T18:00:00+01:00',
    items: [],
    ...extra,
  };
}

describe('isExpensesTile', () => {
  it('matches renderer or type and ignores the section name', () => {
    expect(isExpensesTile(update({ renderer: 'expenses' }))).toBe(true);
    expect(isExpensesTile(update({ type: 'expenses' }))).toBe(true);
    expect(isExpensesTile(update({ section: 'expenses_weekly' }))).toBe(false);
    expect(isExpensesTile(update({ section: 'prad' }))).toBe(false);
  });
});

describe('readExpensesTile', () => {
  it('keeps known blocks and drops an unknown one', () => {
    const model = readExpensesTile(
      update({
        period: '2026-10',
        total: 12.5,
        currency: 'PLN',
        blocks: [
          { type: 'kpi', items: [{ label: 'Zużycie', value: '10 kWh', delta: '-1%' }] },
          { type: 'note', text: 'Termin jutro.' },
          { type: 'spark', text: 'nope' },
        ],
      }),
    );
    expect(model.period).toBe('2026-10');
    expect(model.blocks.map((block) => block.type)).toEqual(['kpi', 'text']);
    expect(formatExpenseTotal(model.total, model.currency)).toBe('12,50 zł');
  });

  it('shows a string total as sent', () => {
    expect(formatExpenseTotal('361,05 zł', 'PLN')).toBe('361,05 zł');
    expect(formatExpenseTotal(10, 'EUR')).toBe('10,00 EUR');
  });
});
