import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { SectionUpdate } from '../types';
import { SectionCard } from './SectionCard';

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
