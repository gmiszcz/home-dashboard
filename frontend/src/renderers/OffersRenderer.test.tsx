import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import type { DashboardItem, ExclusionRecord, SectionUpdate } from '../types';
import { OffersRenderer } from './OffersRenderer';

const srcDir = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-11-01T09:00:00Z');

function makeUpdate(items: DashboardItem[], section = 'gabinety'): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-01T08:00:00Z',
    schema_version: 1,
    section,
    renderer: 'offers',
    generated_at: '2026-11-01T08:00:00Z',
    title: 'Gabinety',
    items,
  };
}

function render(items: DashboardItem[]): string {
  return renderToStaticMarkup(
    <OffersRenderer update={makeUpdate(items)} now={NOW} />,
  );
}

function click(node: ReactTestInstance) {
  let prevented = false;
  act(() => {
    node.props.onPointerDown({ stopPropagation() {} });
    node.props.onClick({
      stopPropagation() {},
      preventDefault() {
        prevented = true;
      },
    });
  });
  return prevented;
}

function buttons(renderer: ReactTestRenderer, className: string): ReactTestInstance[] {
  return renderer.root.findAll(
    (node) =>
      node.type === 'button' &&
      typeof node.props.className === 'string' &&
      node.props.className.split(' ').includes(className),
  );
}

function insideLink(node: ReactTestInstance): boolean {
  let current: ReactTestInstance | null = node;
  while (current) {
    if (current.type === 'a') return true;
    current = current.parent;
  }
  return false;
}

describe('OffersRenderer cards', () => {
  it('shows a photo, the link, price, location, badges and note', () => {
    const html = render([
      {
        id: 'g1',
        title: 'Gabinet w Gliwicach',
        url: 'https://example.com/gabinet',
        price: '1 800 zł / mies.',
        location: 'Gliwice',
        description: 'Dwa dni w tygodniu.',
        image_url: 'https://example.com/photo.jpg',
        badges: ['kosmetologia', '2 dni'],
        note: 'Wolne od marca',
      },
    ]);
    expect(html).toContain('class="offer-card has-photo"');
    expect(html).toContain('src="https://example.com/photo.jpg"');
    expect(html).toContain('href="https://example.com/gabinet"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('1 800 zł / mies.');
    expect(html).toContain('Gliwice');
    expect(html).toContain('Dwa dni w tygodniu.');
    expect(html).toContain('kosmetologia');
    expect(html).toContain('Wolne od marca');
    expect(html).toContain('Nie interesuje mnie');
  });

  it('looks complete without a photo and ignores a non-http image', () => {
    const html = render([
      {
        id: 'd1',
        title: 'Domek w Beskidach',
        url: 'https://example.com/domek',
        price: '450 zł / doba',
        image_url: 'javascript:alert(1)',
      },
    ]);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('has-photo');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('class="offer-card"');
    expect(html).toContain('Domek w Beskidach');
    expect(html).toContain('450 zł / doba');
  });

  it('keeps the old gabinety and domki field names', () => {
    const html = render([
      {
        id: 'old-1',
        nazwa: 'Podnajem na Zwycięstwa',
        link: 'https://example.com/stary',
        cena: '900 zł',
        lokalizacja: 'Zabrze',
        opis: 'Gabinet od zaraz',
      },
    ]);
    expect(html).toContain('Podnajem na Zwycięstwa');
    expect(html).toContain('href="https://example.com/stary"');
    expect(html).toContain('900 zł');
    expect(html).toContain('Zabrze');
    expect(html).toContain('Gabinet od zaraz');
  });

  it('falls back from description to text, then subtitle', () => {
    const fromText = render([{ id: 't', title: 'A', text: 'Z tekstu' }]);
    expect(fromText).toContain('Z tekstu');
    const fromSubtitle = render([{ id: 's', title: 'B', text: '   ', subtitle: 'Z podtytułu' }]);
    expect(fromSubtitle).toContain('Z podtytułu');
  });
});

describe('OffersRenderer hide, restore and favorites', () => {
  function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : nodeText(child)))
    .join('');
}

function Harness({ items }: { items: DashboardItem[] }) {
    const [excluded, setExcluded] = useState<ExclusionRecord[]>([]);
    const [starred, setStarred] = useState<DashboardItem[]>([]);
    return (
      <OffersRenderer
        update={makeUpdate(items)}
        now={NOW}
        isItemStarred={(_section, id) => starred.some((item) => item.id === id)}
        onStarItem={(_section, _id, item) => setStarred((current) => [...current, item])}
        onUnstarItem={(_section, id) => setStarred((current) => current.filter((item) => item.id !== id))}
        getSectionFavorites={() =>
          starred.map((item) => ({
            section: 'gabinety',
            item_id: String(item.id),
            saved_at: '2026-11-01T10:00:00+00:00',
            item_data: item,
          }))
        }
        getSectionExclusions={() => excluded}
        onExcludeOffer={(section, offerId, url, title) => {
          setExcluded((current) => [
            ...current,
            {
              section,
              offer_id: offerId,
              url,
              title,
              excluded_at: '2026-11-01T10:00:00+00:00',
            },
          ]);
        }}
        onRestoreOffer={(_section, offerId) => {
          setExcluded((current) => current.filter((row) => row.offer_id !== offerId));
        }}
      />
    );
  }

  it('hides a card on click without following the link or cancelling the scroll', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <Harness
          items={[
            { id: 'keep', title: 'Zostaje', url: 'https://example.com/keep' },
            { id: 'drop', title: 'Znika', url: 'https://example.com/drop', image_url: 'https://example.com/p.jpg' },
          ]}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');

    const hide = buttons(renderer, 'offer-hide-btn');
    expect(hide).toHaveLength(2);
    expect(hide.every((button) => button.props.type === 'button' && !insideLink(button))).toBe(true);
    expect(buttons(renderer, 'offer-star').every((button) => !insideLink(button))).toBe(true);

    expect(click(hide[1])).toBe(false);
    expect(renderer.root.findAllByProps({ className: 'item-title' }).map((node) => nodeText(node))).toEqual([
      'Zostaje',
    ]);
  });

  it('lists a hidden offer under Ukryte and puts it back with Przywróć', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <Harness items={[{ id: 'g1', title: 'Gabinet testowy', url: 'https://example.com/g' }]} />,
      );
    });
    if (!renderer) throw new Error('renderer missing');
    const view = renderer;

    act(() => {
      click(buttons(view, 'offer-hide-btn')[0]);
    });
    expect(view.root.findAllByProps({ className: 'item-title' })).toHaveLength(0);

    const hidden = buttons(view, 'offer-hidden-btn')[0];
    expect(nodeText(hidden)).toContain('Ukryte (1)');
    act(() => {
      click(hidden);
    });
    expect(nodeText(view.root.findByProps({ className: 'item-title' }))).toBe('Gabinet testowy');

    const restore = buttons(view, 'offer-restore-btn')[0];
    expect(restore.props.type).toBe('button');
    expect(insideLink(restore)).toBe(false);
    act(() => {
      click(restore);
    });
    expect(buttons(view, 'offer-restore-btn')).toHaveLength(0);
    expect(nodeText(view.root.findByProps({ className: 'item-title' }))).toBe('Gabinet testowy');
  });

  it('marks a favorite and sorts it ahead of a better rank', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <Harness
          items={[
            { id: 'plain', title: 'Zwykła', rank: 1 },
            { id: 'loved', title: 'Ulubiona', rank: 9 },
          ]}
        />,
      );
    });
    if (!renderer) throw new Error('renderer missing');

    const titles = () =>
      renderer!.root.findAllByProps({ className: 'item-title' }).map((node) => nodeText(node));
    expect(titles()).toEqual(['Zwykła', 'Ulubiona']);

    const star = buttons(renderer, 'offer-star')[1];
    act(() => {
      click(star);
    });
    expect(titles()).toEqual(['Ulubiona', 'Zwykła']);
    expect(buttons(renderer, 'offer-star')[0].props.className).toContain('is-starred');
    expect(nodeText(buttons(renderer, 'offer-favorites-btn')[0])).toContain('Ulubione (1)');
  });
});

describe('OffersRenderer touch contract', () => {
  it('does not cancel scrolling and keeps the dismiss control off the link', () => {
    const source = readFileSync(join(srcDir, 'OffersRenderer.tsx'), 'utf8');
    expect(source).not.toContain('preventDefault');
    expect(source).toContain('Nie interesuje mnie');
    expect(source).toContain('Przywróć');
    expect(source).toContain("type=\"button\"");
  });
});
