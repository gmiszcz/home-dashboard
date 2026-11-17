import { describe, expect, it } from 'vitest';

import {
  barFillColor,
  barScale,
  formatBarValue,
  formatExpenseTotal,
  isExpensesTile,
  linearTrend,
  plotY,
  readExpensesTile,
} from './expensesTile';
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

  it('reads bar overlays, drilldown, emphasis and comments', () => {
    const model = readExpensesTile(
      update({
        blocks: [
          {
            type: 'bars',
            labels: ['I', 'II', 'III'],
            show_values: true,
            trend: true,
            unit: 'zł',
            series: [{ name: 'Razem', values: [1, 2, 3] }],
            line_series: [{ name: 'Średnia', values: [1, 2, 2], color: '#e2a53a' }],
          },
          {
            type: 'drilldown',
            labels: ['I', 'II'],
            selected: 'b',
            items: [
              { id: 'a', label: 'A', series: [1, 2] },
              { id: 'b', label: 'B', share_pct: 10, change: '+1%', series: [3, 4] },
            ],
          },
          { type: 'kpi', items: [{ label: 'Nadpłata', value: '2 zł', emphasis: true, tone: 'good' }] },
          { type: 'list', items: [{ label: 'Rata', comment: 'z konta' }] },
          { type: 'table', columns: ['M'], rows: [{ cells: ['X'], comment: 'korekta' }] },
        ],
      }),
    );
    const bars = model.blocks[0];
    expect(bars.type).toBe('bars');
    if (bars.type !== 'bars') return;
    expect(bars.showValues).toBe(true);
    expect(bars.trend).toBe(true);
    expect(bars.signTone).toBe(false);
    expect(bars.series[0].tones).toEqual([null, null, null]);
    expect(bars.lineSeries[0].values).toEqual([1, 2, 2]);
    const drill = model.blocks[1];
    expect(drill.type).toBe('drilldown');
    if (drill.type !== 'drilldown') return;
    expect(drill.selected).toBe('b');
    const kpi = model.blocks[2];
    expect(kpi.type).toBe('kpi');
    if (kpi.type !== 'kpi') return;
    expect(kpi.items[0]).toMatchObject({ emphasis: true, tone: 'good' });
    const list = model.blocks[3];
    expect(list.type).toBe('list');
    if (list.type !== 'list') return;
    expect(list.items[0].comment).toBe('z konta');
    const table = model.blocks[4];
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.rows[0].comment).toBe('korekta');
  });

  it('reads a signed scale, sign_tone and a per-bar tone', () => {
    const model = readExpensesTile(
      update({
        blocks: [
          {
            type: 'bars',
            labels: ['sty', 'lut'],
            sign_tone: true,
            series: [
              {
                name: 'Saldo',
                values: [-531, { value: 151, tone: 'good' }],
                tones: ['bad', null],
              },
            ],
            line_series: [{ name: 'Plan', values: [-600, 20] }],
          },
        ],
      }),
    );
    const bars = model.blocks[0];
    expect(bars.type).toBe('bars');
    if (bars.type !== 'bars') return;
    expect(bars.signTone).toBe(true);
    expect(bars.series[0].values).toEqual([-531, 151]);
    expect(bars.series[0].tones).toEqual(['bad', 'good']);
    const scale = barScale([-531, 151, -600, 20]);
    expect(scale).toEqual({ signed: true, low: -600, high: 151 });
    expect(barScale([10, 20])).toEqual({ signed: false, low: 0, high: 20 });
    expect(plotY(20, 0, 20)).toBe(0);
    expect(plotY(-600, -600, 151)).toBe(100);
    expect(barFillColor(-10, null, 0, null, false)).toBe('#e07a6a');
    expect(barFillColor(10, '#112233', 0, null, false)).toBe('#112233');
    expect(barFillColor(10, '#112233', 0, null, true)).toBe('#7dcea0');
    expect(barFillColor(-10, null, 0, 'good', true)).toBe('#7dcea0');
  });

  it('fits a straight series exactly and shortens large bar labels', () => {
    expect(linearTrend([1, 2, 3])).toEqual([1, 2, 3]);
    expect(linearTrend([4])).toBeNull();
    expect(formatBarValue(842.3, 'zł', false)).toBe('842,3 zł');
    expect(formatBarValue(842.3, 'zł', true)).toBe('842 zł');
  });

  it('shows a string total as sent', () => {
    expect(formatExpenseTotal('361,05 zł', 'PLN')).toBe('361,05 zł');
    expect(formatExpenseTotal(10, 'EUR')).toBe('10,00 EUR');
  });
});
