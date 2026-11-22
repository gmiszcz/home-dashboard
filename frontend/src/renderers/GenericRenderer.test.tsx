import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import type { DashboardItem, SectionUpdate } from '../types';
import { GenericRenderer } from './GenericRenderer';

const srcDir = dirname(fileURLToPath(import.meta.url));

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

describe('GenericRenderer thumbnail', () => {
  // Windows checkouts convert line endings (core.autocrlf), so compare with LF only.
  const css = readFileSync(join(srcDir, '../index.css'), 'utf8').replace(/\r\n/g, '\n');
  const source = readFileSync(join(srcDir, 'GenericRenderer.tsx'), 'utf8');

  it('shows a rounded thumbnail inside the same link as the title', () => {
    const html = render([
      {
        id: 'g1',
        title: 'Podnajem gabinetu – kosmetolog',
        text: 'Gabinet do podnajmu w Gliwicach, dwa dni w tygodniu.',
        url: 'https://example.com/gabinet',
        date: '2025-03-02',
        status: 'nowe',
        image_url: 'https://cdn.example/gabinet.jpg',
      },
    ]);

    const linkStart = html.indexOf('<a ');
    const imgAt = html.indexOf('<img ');
    const titleAt = html.indexOf('item-title');
    const linkEnd = html.indexOf('</a>');
    const descAt = html.indexOf('item-desc');
    expect(linkStart).toBeGreaterThan(-1);
    expect(imgAt).toBeGreaterThan(linkStart);
    expect(titleAt).toBeGreaterThan(imgAt);
    expect(linkEnd).toBeGreaterThan(titleAt);
    expect(descAt).toBeGreaterThan(linkEnd);
    expect(html).toContain('class="item-main has-thumb"');
    expect(html).toContain('class="item-thumb"');
    expect(html).toContain('src="https://cdn.example/gabinet.jpg"');
    expect(html).toContain('alt="Podnajem gabinetu – kosmetolog"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('Gabinet do podnajmu w Gliwicach, dwa dni w tygodniu.');
    expect(html).toContain('href="https://example.com/gabinet"');
    expect(html).toContain('nowe');

    const thumbRuleAt = css.indexOf('\n.item-main.has-thumb {');
    const thumbAt = css.indexOf('\n.item-thumb {');
    const thumbRule = css.slice(thumbRuleAt, css.indexOf('}', thumbRuleAt));
    const thumb = css.slice(thumbAt, css.indexOf('}', thumbAt));
    expect(thumbRule).toContain('--thumb: 72px');
    expect(thumb).toContain('width: var(--thumb)');
    expect(thumb).toContain('height: var(--thumb)');
    expect(thumb).toContain('object-fit: cover');
    expect(thumb).toContain('border-radius: 8px');
    expect(thumb).toContain('touch-action: pan-y');
    expect(thumb).not.toContain('touch-action: none');
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*--thumb:\s*56px/);
    expect(css).toContain('.card-wrapper.span-1 .item-main.has-thumb {\n  --thumb: 56px;');
    expect(source).not.toMatch(/onPointer|onTouch|onMouse|onDrag/);
  });

  it('renders an item without an image exactly as a title row', () => {
    const html = render([
      {
        id: 'g2',
        name: 'Tylko nazwa',
        text: 'Opis bez zdjęcia.',
        url: 'https://example.com/nazwa',
        date: '2025-03-02',
        status: 'aktywny',
      },
    ]);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('has-thumb');
    expect(html).not.toContain('item-thumb');
    expect(html).toContain(
      '<div class="item-main"><a class="quiet-link" href="https://example.com/nazwa" target="_blank" rel="noreferrer"><span class="item-title">Tylko nazwa</span></a>',
    );
    expect(html).toContain('class="item-desc"');
    expect(html).toContain('Opis bez zdjęcia.');
    expect(html).toContain('class="muted"');
    expect(html).toContain('aktywny');
  });

  it('prefers image_url, then image, then thumbnail', () => {
    const preferred = render([
      {
        title: 'A',
        image_url: 'https://cdn.example/preferred.jpg',
        image: 'https://cdn.example/image.jpg',
        thumbnail: 'https://cdn.example/thumb.jpg',
      },
    ]);
    expect(preferred).toContain('src="https://cdn.example/preferred.jpg"');
    expect(preferred).not.toContain('image.jpg');
    expect(preferred).not.toContain('thumb.jpg');

    const fromImage = render([
      {
        title: 'B',
        image_url: '   ',
        image: 'https://cdn.example/image.jpg',
        thumbnail: 'https://cdn.example/thumb.jpg',
      },
    ]);
    expect(fromImage).toContain('src="https://cdn.example/image.jpg"');
    expect(fromImage).not.toContain('thumb.jpg');

    const fromThumbnail = render([
      { title: 'C', image_url: 'notaurl', thumbnail: 'https://cdn.example/thumb.jpg' },
    ]);
    expect(fromThumbnail).toContain('src="https://cdn.example/thumb.jpg"');
    expect(fromThumbnail).not.toContain('notaurl');

    const blank = render([{ title: 'D', image_url: ' ', image: '', thumbnail: '   ' }]);
    expect(blank).not.toContain('<img');
    expect(blank).not.toContain('has-thumb');
  });

  it('hides the thumbnail when the image fails to load', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <GenericRenderer
          update={makeUpdate([
            {
              title: 'Oferta ze zdjęciem',
              text: 'Krótki opis oferty.',
              url: 'https://example.com/oferta',
              image_url: 'https://cdn.example/broken.jpg',
              status: 'nowe',
            },
          ])}
          now={new Date('2025-01-01T09:00:00Z')}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');

    const img = renderer.root.findByType('img');
    expect(img.props).toMatchObject({
      alt: 'Oferta ze zdjęciem',
      src: 'https://cdn.example/broken.jpg',
      draggable: false,
      loading: 'lazy',
      referrerPolicy: 'no-referrer',
    });
    expect(img.props.onPointerDown).toBeUndefined();
    expect(img.props.onTouchStart).toBeUndefined();
    const link = renderer.root.findByType('a');
    expect(link.findAllByType('img')).toHaveLength(1);
    expect(link.findAllByProps({ className: 'item-desc' })).toHaveLength(0);

    act(() => {
      img.props.onError();
    });

    expect(renderer.root.findAllByType('img')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ className: 'item-main has-thumb' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ className: 'item-main' })).toHaveLength(1);
    expect(renderer.root.findByProps({ className: 'item-title' }).children).toContain('Oferta ze zdjęciem');
    expect(renderer.root.findByProps({ className: 'item-desc' }).children).toContain('Krótki opis oferty.');
    expect(renderer.root.findByType('a').props.href).toBe('https://example.com/oferta');
  });
});
