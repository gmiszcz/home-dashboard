import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

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
    expect(html).toContain('expense-comment');
    expect(html).toContain('z konta');
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
