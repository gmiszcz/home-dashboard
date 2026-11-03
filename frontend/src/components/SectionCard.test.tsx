import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiMemoryAfterToggle, aiReadOpenStorageKey, aiReadSnapshot, aiViewStorageKey } from '../sections';
import type { SectionUpdate } from '../types';
import { readAiViewMemory, SectionCard } from './SectionCard';

vi.mock('../renderers', () => ({ SectionBody: () => null }));

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

describe('SectionCard AI auto-collapse', () => {
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
  const noneRead = () => false;
  const isCollapsed = (html: string) => toggleMarkup(html).includes('aria-expanded="false"');

  it('renders an all-read AI tile collapsed', () => {
    expect(isCollapsed(render(makeUpdate('ai_daily'), { isItemAcked: allRead }))).toBe(true);
  });

  it('renders an AI tile with unread articles open', () => {
    expect(isCollapsed(render(makeUpdate('ai_daily'), { isItemAcked: noneRead }))).toBe(false);
  });

  it('keeps an all-read tile open after a reload when the user opened it', () => {
    const opened = aiMemoryAfterToggle(
      readAiViewMemory('ai_daily'),
      'collapsed',
      aiReadSnapshot('ai_daily', [{ id: 'a' }], allRead),
    );
    storage.set(aiViewStorageKey('ai_daily'), opened.stored ?? '');
    storage.set(aiReadOpenStorageKey('ai_daily'), opened.readOpen ?? '');

    const html = render(makeUpdate('ai_daily'), { isItemAcked: allRead, isFresh: true });
    expect(isCollapsed(html)).toBe(false);
  });

  it('does not open an all-read tile just because its content is fresh', () => {
    const html = render(makeUpdate('ai_daily'), { isItemAcked: allRead, isFresh: true });
    expect(isCollapsed(html)).toBe(true);
  });
});
