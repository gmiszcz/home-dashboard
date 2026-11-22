import { describe, expect, it } from 'vitest';

import {
  barFillColor,
  barScale,
  distinctGroups,
  diffTone,
  filterBarsByGroup,
  readGroupSelection,
  suffixGroupOf,
  toggleGroupSelection,
  formatBarValue,
  formatDiffDelta,
  formatDiffLine,
  formatDonutCenter,
  formatExpenseTotal,
  isExpensesTile,
  linearTrend,
  plotY,
  readExpensesTile,
  visibleBlockIndexes,
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

  it('keeps blocks outside every view and hides the header amount', () => {
    const model = readExpensesTile(
      update({
        show_total: false,
        total: 842.3,
        default_view: 'saldo',
        views: [
          { id: 'raty', label: 'Raty', blocks: ['raty', 2] },
          { id: 'saldo', label: 'Saldo', blocks: [1] },
        ],
        blocks: [
          {
            type: 'kpi',
            hero: {
              label: 'Nadpłata',
              value: '1 813,04 zł',
              tone: 'good',
              side: { text: '−1 245,82 zł', tone: 'bad' },
              lines: [{ text: 'starcza na ~1,5 raty' }, { text: '−1 245,82 zł vs 31.10', tone: 'bad' }],
            },
          },
          { id: 'saldo', type: 'bars', labels: ['I', 'II'], series: [{ values: [-10, 20] }] },
          { id: 'raty', type: 'bars', labels: ['I', 'II'], series: [{ values: [1, 2] }] },
          { type: 'text', text: 'Stopka.' },
          { type: 'diff', items: [{ label: 'Media', value: '82 zł', delta: -3 }, { label: 'Czynsz', value: '640 zł', delta: '+10 zł', tone: 'auto' }] },
        ],
      }),
    );
    expect(model.showTotal).toBe(false);
    expect(model.defaultView).toBe('saldo');
    expect(visibleBlockIndexes(model.blocks, model.views, 'saldo')).toEqual([0, 1, 3, 4]);
    expect(visibleBlockIndexes(model.blocks, model.views, 'raty')).toEqual([0, 2, 3, 4]);
    const hero = model.blocks[0];
    expect(hero.type).toBe('kpi');
    if (hero.type !== 'kpi' || !hero.hero) return;
    expect(hero.hero.lines[1].tone).toBe('bad');
    expect(hero.hero.side).toEqual({ text: '−1 245,82 zł', tone: 'bad' });
    const diff = model.blocks[4];
    expect(diff.type).toBe('diff');
    if (diff.type !== 'diff') return;
    expect(diffTone(diff.items[0].delta, diff.items[0].tone)).toBe('good');
    expect(diffTone(0, 'auto')).toBe('neutral');
    expect(diffTone(10, null)).toBe('bad');
    expect(diffTone('+10 zł', 'auto')).toBe('bad');
    expect(formatDiffDelta(-3)).toBe('−3');
    expect(formatDiffLine('206,40 zł', 25.2, null)).toBe('206,40 zł (+25,20 zł, +13,9%)');
    expect(formatDiffLine('82,30 zł', -3.2, -3.7)).toBe('82,30 zł (−3,20 zł, −3,7%)');
    expect(formatDiffLine('120,00 zł', 0, null)).toBe('120,00 zł');
    expect(formatDonutCenter('1245,82 zł', 0)).toBe('1246 zł');
    expect(formatDonutCenter('842 zł', null)).toBe('842 zł');
  });

  it('shows a string total as sent', () => {
    expect(formatExpenseTotal('361,05 zł', 'PLN')).toBe('361,05 zł');
    expect(formatExpenseTotal(10, 'EUR')).toBe('10,00 EUR');
  });
});

describe('point groups', () => {
  const sun = { id: 'sun', icon: 'sun', label: 'Rano' };
  const moon = { id: 'moon', icon: 'moon', label: 'Wieczór' };
  const bars = {
    labels: ['16.11', '16.11', '17.11', '17.11'],
    groups: [sun, moon, sun, moon],
    highlight: 3,
    series: [{ name: 'skurczowe', values: [120, 130, 125, 135], color: null, tones: [null, 'bad', null, null] as ('good' | 'bad' | null)[] }],
    lineSeries: [],
  };

  function read(blocks: unknown[]) {
    const model = readExpensesTile(update({ blocks }));
    const block = model.blocks[0];
    if (block.type !== 'bars') throw new Error('expected bars');
    return block;
  }

  it('reads groups sent with the points', () => {
    const block = read([
      {
        type: 'bars',
        labels: ['a', 'b', 'c'],
        groups: [{ id: 'sun', icon: 'pi-sun' }, { id: 'moon', icon: 'moon', label: 'Wieczór' }, null],
        series: [{ values: [1, 2, 3] }],
      },
    ]);
    expect(block.groups).toEqual([
      { id: 'sun', icon: 'sun', label: 'sun' },
      { id: 'moon', icon: 'moon', label: 'Wieczór' },
      null,
    ]);
  });

  it('ignores a bad icon and a groups list of the wrong length', () => {
    const bad = read([
      { type: 'bars', labels: ['a', 'b'], groups: [{ id: 'x', icon: '<b>' }, 'sun'], series: [{ values: [1, 2] }] },
    ]);
    expect(bad.groups).toEqual([null, null]);
    const short = read([{ type: 'bars', labels: ['a', 'b'], groups: [{ id: 'x', icon: 'sun' }], series: [{ values: [1, 2] }] }]);
    expect(short.groups).toEqual([null, null]);
  });

  it('falls back to the " r" / " w" label suffix', () => {
    expect(suffixGroupOf('16.11 r')).toMatchObject({ id: 'r', icon: 'sun' });
    expect(suffixGroupOf('16.11 w')).toMatchObject({ id: 'w', icon: 'moon' });
    expect(suffixGroupOf('pon')).toBeNull();
    const block = read([{ type: 'bars', labels: ['1 r', '1 w'], series: [{ values: [1, 2] }] }]);
    expect(block.groups.map((group) => group?.id)).toEqual(['r', 'w']);
  });

  it('lists distinct groups across blocks, so no groups means no toggle', () => {
    expect(distinctGroups([bars.groups, [moon, null]]).map((group) => group.id)).toEqual(['sun', 'moon']);
    expect(distinctGroups([[null, null]])).toEqual([]);
  });

  it('keeps only the selected groups and remaps the highlight', () => {
    const morning = filterBarsByGroup(bars, new Set(['sun']));
    expect(morning.labels).toEqual(['16.11', '17.11']);
    expect(morning.series[0].values).toEqual([120, 125]);
    expect(morning.highlight).toBeNull();
    const evening = filterBarsByGroup(bars, new Set(['moon']));
    expect(evening.series[0].values).toEqual([130, 135]);
    expect(evening.series[0].tones).toEqual(['bad', null]);
    expect(evening.highlight).toBe(1);
  });

  it('leaves everything selected and ungrouped charts unchanged', () => {
    expect(filterBarsByGroup(bars, new Set(['sun', 'moon']))).toBe(bars);
    const plain = { ...bars, groups: [null, null, null, null] };
    expect(filterBarsByGroup(plain, new Set(['sun']))).toBe(plain);
  });

  it('defaults to all and never turns the last one off', () => {
    const available = [sun, moon];
    expect([...readGroupSelection(null, available)]).toEqual(['sun', 'moon']);
    expect([...readGroupSelection('moon', available)]).toEqual(['moon']);
    expect([...readGroupSelection('junk', available)]).toEqual(['sun', 'moon']);
    const eveningOnly = toggleGroupSelection(new Set(['sun', 'moon']), 'sun');
    expect([...eveningOnly]).toEqual(['moon']);
    expect([...toggleGroupSelection(eveningOnly, 'moon')]).toEqual(['moon']);
    expect([...toggleGroupSelection(eveningOnly, 'sun')].sort()).toEqual(['moon', 'sun']);
  });
});