import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiViewStorageKey } from '../sections';
import type { SectionUpdate } from '../types';
import { SectionCard } from './SectionCard';

vi.mock('../renderers', () => ({ SectionBody: () => <i className="body-stub" /> }));
// The real overlay renders into document.body through a portal, which static markup cannot do
vi.mock('./EnlargeOverlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./EnlargeOverlay')>();
  return {
    ...actual,
    EnlargeOverlay: ({
      title,
      onClose,
      children,
    }: {
      title: string;
      onClose: () => void;
      children: ReactNode;
    }) => (
      <actual.EnlargePanel title={title} titleId="overlay-title" onClose={onClose}>
        {children}
      </actual.EnlargePanel>
    ),
  };
});

function makeUpdate(section: string, display: SectionUpdate['display'] = {}): SectionUpdate {
  return {
    id: 1,
    received_at: '2025-01-01T08:00:00Z',
    schema_version: 1,
    section,
    generated_at: '2025-01-01T08:00:00Z',
    display,
    items: [{ id: 'a', title: 'Item' }],
  };
}

function render(update: SectionUpdate, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <SectionCard update={update} now={new Date('2025-01-01T09:00:00Z')} {...props} />,
  );
}

/** The `<button class="card-head-toggle">` element, including its content. */
function toggleMarkup(html: string): string {
  const match = html.match(/<button[^>]*class="card-head-toggle"[^>]*>.*?<\/button>/s);
  if (!match) throw new Error('card head toggle button not found');
  return match[0];
}

describe('SectionCard head', () => {
  it('renders the title as a real button that controls the tile body', () => {
    const html = render(makeUpdate('parcels'));
    const toggle = toggleMarkup(html);
    const bodyId = /aria-controls="([^"]+)"/.exec(toggle)?.[1];

    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-expanded="true"');
    expect(bodyId).toBeTruthy();
    expect(html).toContain(`id="${bodyId}"`);
  });

  it('reports a collapsed tile through aria-expanded', () => {
    const html = render(makeUpdate('parcels', { collapsed: true }));

    expect(toggleMarkup(html)).toContain('aria-expanded="false"');
  });

  it('does not use a role=button wrapper around the head controls', () => {
    const html = render(makeUpdate('calendar'), { onToggleWidth: () => undefined });
    const head = html.slice(html.indexOf('card-head clickable'), html.indexOf('card-body-region'));

    expect(head).not.toContain('role="button"');
  });

  it('keeps calendar filters outside the toggle button', () => {
    const html = render(makeUpdate('calendar'));
    const toggle = toggleMarkup(html);

    expect(toggle).not.toContain('<input');
    expect(toggle).not.toContain('<label');
    expect(html).toContain('type="checkbox"');
  });

  it('keeps the promotions filter and header actions outside the toggle button', () => {
    const html = render(makeUpdate('promotions'), {
      onToggleWidth: () => undefined,
      onAcknowledge: () => undefined,
      isFresh: true,
    });
    const toggle = toggleMarkup(html);

    expect(toggle).not.toContain('<input');
    expect(toggle).not.toContain('card-action-btn');
    expect(toggle).not.toContain('card-ack-btn');
    expect(html).toContain('width-toggle-btn');
    expect(html).toContain('card-ack-btn');
  });

  it('keeps the AI view control as a sibling of the title button', () => {
    const html = render(makeUpdate('ai_daily'));
    const toggle = toggleMarkup(html);

    expect(toggle).not.toContain('ai-view-btn');
    expect(toggle).not.toContain('collapse-icon');
    expect(html).toContain('ai-view-btn');
  });
});

describe('SectionCard enlarge button', () => {
  const ENLARGE_LABEL = 'aria-label="Powiększ na cały ekran"';
  const bodyStubs = (html: string) => (html.match(/body-stub/g) ?? []).length;

  it('shows the enlarge button on both expenses tiles', () => {
    for (const section of ['expenses_weekly', 'expenses_monthly']) {
      const html = render(makeUpdate(section));
      expect(html).toContain('enlarge-btn');
      expect(html).toContain(ENLARGE_LABEL);
    }
  });

  it('does not show it on other tiles', () => {
    for (const section of ['parcels', 'finance', 'ai_daily', 'calendar']) {
      expect(render(makeUpdate(section))).not.toContain('enlarge-btn');
    }
  });

  it('keeps the width toggle next to it, outside the title button', () => {
    const html = render(makeUpdate('expenses_weekly'), { onToggleWidth: () => undefined });

    expect(html).toContain('width-toggle-btn');
    expect(html).toContain('enlarge-btn');
    expect(toggleMarkup(html)).not.toContain('enlarge-btn');
  });

  it('starts with the overlay closed', () => {
    const html = render(makeUpdate('expenses_weekly'));

    expect(html).not.toContain('enlarge-overlay');
    expect(html).not.toContain('role="dialog"');
    expect(bodyStubs(html)).toBe(1);
  });

  it('renders the same section body in the open overlay, with a close button', () => {
    const html = render(makeUpdate('expenses_weekly'), { defaultEnlarged: true });

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Zamknij widok pełnoekranowy"');
    expect(bodyStubs(html)).toBe(2);
  });

  it('never opens the overlay on tiles without the enlarge view', () => {
    const html = render(makeUpdate('parcels'), { defaultEnlarged: true });

    expect(html).not.toContain('role="dialog"');
  });
});

describe('SectionCard AI view', () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const allRead = () => true;
  const isCollapsed = (html: string) => toggleMarkup(html).includes('aria-expanded="false"');

  it('shows the view stored on this device', () => {
    storage.set(aiViewStorageKey('ai_daily'), 'full');
    expect(isCollapsed(render(makeUpdate('ai_daily'), { isItemAcked: allRead }))).toBe(false);
    storage.set(aiViewStorageKey('ai_daily'), 'collapsed');
    expect(isCollapsed(render(makeUpdate('ai_daily'), { isItemAcked: allRead }))).toBe(true);
  });

  it('does not open a collapsed AI tile when its content is fresh', () => {
    storage.set(aiViewStorageKey('ai_weekly'), 'collapsed');
    expect(isCollapsed(render(makeUpdate('ai_weekly'), { isFresh: true }))).toBe(true);
  });
});
