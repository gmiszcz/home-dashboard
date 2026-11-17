import { renderToStaticMarkup } from 'react-dom/server';
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
});
