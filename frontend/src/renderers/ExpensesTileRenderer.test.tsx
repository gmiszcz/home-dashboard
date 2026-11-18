import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { SIGNED_VALUE_INSET, barScale, formatBarValue, linearTrend, plotY } from '../expensesTile';
import type { SectionUpdate } from '../types';
import { ExpensesTileRenderer } from './ExpensesTileRenderer';

const update = {
  id: 1,
  received_at: '2026-11-12T17:00:00Z',
  schema_version: 1,
  section: 'tauron_expenses',
  generated_at: '2026-11-12T18:00:00+01:00',
  title: 'Tauron',
  period: '2026-10',
  total: 361.05,
  currency: 'PLN',
  items: [],
  blocks: [
    { type: 'kpi', items: [{ label: 'Zużycie', value: '247 kWh' }] },
    {
      type: 'donut',
      center: '361 zł',
      segments: [
        { label: 'Energia', value: 200 },
        { label: 'Dystrybucja', value: 161 },
      ],
    },
    {
      type: 'list',
      items: [{ label: 'Faktura', amount: '361,05 zł', date: '2026-11-09', status: 'unpaid' }],
    },
    { type: 'text', text: 'Termin 25 listopada.' },
  ],
} as SectionUpdate;

describe('ExpensesTileRenderer', () => {
  it('renders the header amount and each block from the payload', () => {
    const html = renderToStaticMarkup(<ExpensesTileRenderer update={update} now={new Date('2026-11-12T18:00:00Z')} />);
    expect(html).toContain('2026-10');
    expect(html).toContain('361,05 zł');
    expect(html).toContain('247 kWh');
    expect(html).toContain('Energia');
    expect(html).toContain('Nieopłacone');
    expect(html).toContain('Termin 25 listopada.');
    expect(html).toContain('<svg');
  });

  it('draws bar values, a trend line, an emphasised kpi and a row comment', () => {
    const html = renderToStaticMarkup(
      <ExpensesTileRenderer
        update={{
          ...update,
          blocks: [
            { type: 'kpi', items: [{ label: 'Nadpłata', value: '12 zł', emphasis: true, tone: 'good' }] },
            {
              type: 'bars',
              unit: 'zł',
              labels: ['X', 'XI'],
              show_values: true,
              trend: true,
              series: [{ name: 'Razem', values: [10, 20] }],
            },
            { type: 'list', items: [{ label: 'Rata', amount: '10 zł', comment: 'z konta' }] },
          ],
        } as SectionUpdate}
        now={new Date('2026-11-12T18:00:00Z')}
      />,
    );
    expect(html).toContain('is-emphasis');
    expect(html).toContain('is-good');
    expect(html).toContain('expense-bar-value-full');
    expect(html).toContain('10 zł');
    expect(html).toContain('expense-trend-line');
    expect(html).not.toContain('expense-zero-line');
    expect(html).not.toContain('is-signed');
    expect(html).not.toContain('is-down');
    expect(html).toContain('expense-comment');
    expect(html).toContain('z konta');
    expect(html).toContain('expense-line-amount');
    expect(html).toContain('10 zł');
  });

  it('draws negative bars down from a zero line on one signed scale', () => {
    const values = [-10, 20];
    const trend = linearTrend(values) ?? [];
    const scale = barScale([...values, ...trend]);
    const html = renderToStaticMarkup(
      <ExpensesTileRenderer
        update={{
          ...update,
          blocks: [
            {
              type: 'bars',
              unit: 'zł',
              labels: ['X', 'XI'],
              show_values: true,
              trend: true,
              series: [{ name: 'Saldo', values, tones: [null, 'good'] }],
            },
          ],
        } as SectionUpdate}
        now={new Date('2026-11-12T18:00:00Z')}
      />,
    );
    expect(html).toContain('expense-zero-line');
    expect(html).toContain('is-down');
    expect(html).toContain('is-bad');
    expect(html).toContain('#e07a6a');
    expect(html).toContain('#7dcea0');
    expect(html).toContain('expense-bar-tag is-below');
    expect(html).toContain('expense-bar-tag is-above');
    expect(html).not.toContain('expense-bar-values is-below');
    expect(html).toContain(formatBarValue(-10, 'zł', false));
    expect(html).toContain(formatBarValue(20, 'zł', false));
    const points = trend.map((value, index) => `${index + 0.5},${plotY(value, scale.low, scale.high, SIGNED_VALUE_INSET)}`).join(' ');
    expect(html).toContain(points);
    expect(scale.low).toBeLessThan(0);
    expect(scale.high).toBeGreaterThan(0);
  });

  it('switches a drilldown chip to that component chart', () => {
    const tile = {
      ...update,
      blocks: [
        {
          type: 'drilldown',
          title: 'Składniki',
          unit: 'zł',
          labels: ['X', 'XI'],
          selected: 'czynsz',
          items: [
            { id: 'czynsz', label: 'Czynsz', share_pct: 76, series: [635, 640] },
            { id: 'media', label: 'Media', share_pct: 10, change: '+4%', series: [78, 82.3] },
          ],
        },
      ],
    } as SectionUpdate;
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<ExpensesTileRenderer update={tile} now={new Date('2026-11-12T18:00:00Z')} />);
    });
    if (!renderer) throw new Error('renderer missing');
    const view = renderer;
    const text = (className: string) =>
      view.root
        .findAllByProps({ className })
        .map((node) => node.children.map((child) => (typeof child === 'string' ? child : '')).join(''))
        .join(' ');
    expect(text('expense-bar-value-full')).toContain('635');
    const media = view.root.findAll(
      (node) => node.type === 'button' && String(node.props.className).includes('expense-drill-chip'),
    )[1];
    act(() => {
      media.props.onClick();
    });
    expect(text('expense-bar-value-full')).toContain('78');
    expect(view.root.findByProps({ className: 'expense-trend-line' })).toBeTruthy();
  });

  it('switches view chips and keeps the hero and the footer', () => {
    const html = renderToStaticMarkup(
      <ExpensesTileRenderer
        update={{
          ...update,
          section: 'czynsz-views',
          show_total: false,
          total: 842.3,
          default_view: 'raty',
          views: [
            { id: 'raty', label: 'Raty', blocks: ['donut'] },
            { id: 'saldo', label: 'Saldo', blocks: ['saldo'] },
          ],
          blocks: [
            {
              type: 'kpi',
              hero: {
                value: '1 813,04 zł',
                tone: 'good',
                side: { text: '−1 245,82 zł', tone: 'bad' },
                lines: [{ text: 'starcza na ~1,5 raty' }, { text: '−1 245,82 zł vs 31.10', tone: 'bad' }],
              },
            },
            {
              id: 'donut',
              type: 'donut',
              center: '1245,82 zł',
              center_decimals: 0,
              segments: [{ label: 'Czynsz', value: 640 }],
            },
            { id: 'saldo', type: 'bars', labels: ['I', 'II'], show_values: true, series: [{ name: 'Saldo', values: [-10, 20] }] },
            {
              type: 'diff',
              items: [
                { label: 'Media', value: '82 zł', delta: -3 },
                { label: 'Czynsz', value: '640 zł', delta: 10 },
              ],
            },
            { type: 'text', text: 'Stopka zostaje.' },
          ],
        } as SectionUpdate}
        now={new Date('2026-11-12T18:00:00Z')}
      />,
    );
    expect(html).toContain('expense-hero-row');
    expect(html).toContain('expense-hero-value');
    expect(html).toContain('expense-hero-side is-bad');
    expect(html).toContain('1 813,04 zł');
    expect(html).toContain('−1 245,82 zł');
    expect(html).toContain('is-bad');
    expect(html).toContain('1246 zł');
    expect(html).toContain('is-thick');
    expect(html).toContain('stroke-width="8"');
    expect(html).not.toContain('expense-total');
    expect(html).toContain('Stopka zostaje.');
    expect(html).toContain('is-good');
    expect(html).toContain('−3');
    expect(html).not.toContain('>-10<');

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <ExpensesTileRenderer
          update={{
            ...update,
            section: 'czynsz-views',
            views: [
              { id: 'raty', label: 'Raty', blocks: ['donut'] },
              { id: 'saldo', label: 'Saldo', blocks: ['saldo'] },
            ],
            blocks: [
              { type: 'kpi', items: [{ label: 'Stałe', value: '1 zł' }] },
              { id: 'donut', type: 'donut', segments: [{ label: 'Czynsz', value: 1 }] },
              { id: 'saldo', type: 'bars', labels: ['I'], series: [{ values: [5] }] },
            ],
          } as SectionUpdate}
          now={new Date('2026-11-12T18:00:00Z')}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    const view = renderer;
    expect(view.root.findAll((node) => node.type === 'svg' && String(node.props.className).includes('expense-donut'))).toHaveLength(1);
    const saldo = view.root.findAll(
      (node) => node.type === 'button' && String(node.props.className ?? '') === '' && node.children.includes('Saldo'),
    )[0];
    act(() => {
      saldo.props.onClick({ stopPropagation() {} });
    });
    expect(view.root.findAll((node) => node.type === 'svg' && String(node.props.className).includes('expense-donut'))).toHaveLength(0);
    expect(view.root.findAllByProps({ className: 'expense-bar-fill' })).toHaveLength(1);
    expect(view.root.findAllByProps({ className: 'expense-kpi-value' })).toHaveLength(1);
  });
});

describe('drilldown chips on a narrow tile', () => {
  it('keeps the chip list on one scrollable row', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');
    const at = css.indexOf('.card-wrapper.span-1 .expense-drill-list');
    const block = css.slice(at, css.indexOf('.card-wrapper.span-1 .expense-drill-chip', at));
    expect(block).toContain('flex-wrap: nowrap');
    expect(block).toContain('overflow-x: auto');
    const narrow = css.slice(css.indexOf('@media (max-width: 640px)'));
    const listAt = narrow.indexOf('.expense-drill-list');
    expect(narrow.slice(listAt, narrow.indexOf('.expense-drill-chip', listAt))).toContain('overflow-x: auto');
  });
});

describe('bar labels on a phone', () => {
  it('keeps eleven month labels from overlapping', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');
    const label = css.slice(css.indexOf('.expense-bar-label {'), css.indexOf('.expense-bars-chart'));
    expect(label).toContain('white-space: nowrap');
    expect(label).toContain('text-overflow: ellipsis');
    const narrow = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('.expense-bars {'));
    expect(narrow).toContain('.expense-bar-label');
    expect(narrow).toContain('.expense-bar-value');
    expect(narrow).toContain('.expense-donut-row');
    expect(narrow).toContain('grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr)');
    expect(narrow).toContain('width: 100%');
    const chips = css.slice(css.indexOf('.seg button {'), css.indexOf('.card-wrapper.span-1 .seg button'));
    expect(chips).toContain('align-items: center');
    expect(chips).toContain('justify-content: center');
    expect(css).not.toContain('font-size: 1.55rem');
  });
});

describe('expense lists and tables', () => {
  it('fits rows to the tile and keeps amounts from scrolling sideways', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.css'), 'utf8');
    const tile = css.slice(css.indexOf('.expense-tile {'), css.indexOf('.expense-head'));
    expect(tile).toContain('overflow-x: hidden');
    expect(tile).toContain('min-width: 0');
    const row = css.slice(css.indexOf('.expense-line-main {'), css.indexOf('.expense-line-text'));
    expect(row).toContain('grid-template-columns: minmax(0, 1fr) auto');
    const amount = css.slice(css.indexOf('.expense-line-amount {'), css.indexOf('.expense-comment,'));
    expect(amount).toContain('white-space: nowrap');
    expect(amount).toContain('text-align: right');
    const table = css.slice(css.indexOf('.expense-table {'), css.indexOf('.expense-table th,'));
    expect(table).toContain('table-layout: fixed');
    expect(table).toContain('width: 100%');
    const last = css.slice(css.indexOf('.expense-table th:last-child'), css.indexOf('.expense-table th {'));
    expect(last).toContain('white-space: nowrap');
    const isolated = css.slice(css.indexOf('.board.is-isolated .section-card.p-card .p-card-body'), css.indexOf('.hide-tile-btn.is-on'));
    expect(isolated).toContain('overflow-x: hidden');
    expect(isolated).not.toContain('overflow: auto');
  });
});
