import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { DashboardItem, SectionUpdate } from '../types';
import { GenericRenderer } from './GenericRenderer';

function makeUpdate(items: DashboardItem[]): SectionUpdate {
  return {
    id: 1,
    received_at: '2025-01-01T08:00:00Z',
    schema_version: 1,
    section: 'gabinety',
    generated_at: '2025-01-01T08:00:00Z',
    items,
  };
}

function render(items: DashboardItem[]): string {
  return renderToStaticMarkup(
    <GenericRenderer update={makeUpdate(items)} now={new Date('2025-01-01T09:00:00Z')} />,
  );
}

describe('GenericRenderer item description', () => {
  it('shows text under the title and keeps the title link, date and status', () => {
    const html = render([
      {
        id: 'g1',
        title: 'Podnajem gabinetu – kosmetolog',
        text: 'Gabinet do podnajmu w Gliwicach, dwa dni w tygodniu.',
        url: 'https://example.com/gabinet',
        date: '2025-03-02',
        status: 'nowe',
      },
    ]);

    const titleAt = html.indexOf('item-title');
    const descAt = html.indexOf('item-desc');
    const dateAt = html.indexOf('class="muted"');
    expect(titleAt).toBeGreaterThan(-1);
    expect(descAt).toBeGreaterThan(titleAt);
    expect(dateAt).toBeGreaterThan(descAt);
    expect(html).toContain('Gabinet do podnajmu w Gliwicach, dwa dni w tygodniu.');
    expect(html).toContain('href="https://example.com/gabinet"');
    expect(html).toContain('Podnajem gabinetu – kosmetolog');
    expect(html).toContain('nowe');
    expect(html.indexOf('</a>')).toBeLessThan(descAt);
  });

  it('renders an item without a description exactly as a title row', () => {
    const html = render([
      {
        id: 'g2',
        name: 'Tylko nazwa',
        url: 'https://example.com/nazwa',
        date: '2025-03-02',
        status: 'aktywny',
      },
    ]);

    expect(html).not.toContain('item-desc');
    expect(html).toContain('Tylko nazwa');
    expect(html).toContain('href="https://example.com/nazwa"');
    expect(html).toContain('class="muted"');
    expect(html).toContain('aktywny');
    expect(html).toContain('<ul class="item-list">');
  });

  it('falls back to subtitle, then description, and ignores blank text', () => {
    const subtitle = render([{ title: 'A', text: '   ', subtitle: 'Krótki podtytuł.' }]);
    expect(subtitle).toContain('class="item-desc"');
    expect(subtitle).toContain('Krótki podtytuł.');
    expect(subtitle).not.toContain('   ');

    const description = render([{ title: 'B', description: 'Opis zapasowy oferty.' }]);
    expect(description).toContain('Opis zapasowy oferty.');

    const preferred = render([
      { title: 'C', text: 'Właściwy opis.', subtitle: 'Podtytuł', description: 'Inny opis' },
    ]);
    expect(preferred).toContain('Właściwy opis.');
    expect(preferred).not.toContain('Podtytuł');
    expect(preferred).not.toContain('Inny opis');
  });

  it('omits the description line when the item has no text-like field', () => {
    const html = render([
      { title: 'Z opisem', text: 'Jedno zdanie o ofercie.' },
      { title: 'Bez opisu', status: 'otwarte' },
    ]);

    expect(html).toContain('Jedno zdanie o ofercie.');
    expect(html.match(/item-desc/g)).toHaveLength(1);
    expect(html).toContain('Bez opisu');
    expect(html).toContain('otwarte');
  });
});
