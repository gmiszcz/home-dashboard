import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardItem, SectionUpdate } from '../types';
import { ParcelsRenderer } from './ParcelsRenderer';

vi.mock('primereact/confirmdialog', () => ({ ConfirmDialog: () => null }));

function makeUpdate(items: DashboardItem[]): SectionUpdate {
  return {
    id: 1,
    received_at: '2025-01-01T08:00:00Z',
    schema_version: 1,
    section: 'parcels',
    generated_at: '2025-01-01T08:00:00Z',
    items,
  };
}

const handlers = { onMarkItem: () => undefined, onUnackItem: () => undefined };

function render(items: DashboardItem[], props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <ParcelsRenderer update={makeUpdate(items)} now={new Date('2025-01-01T09:00:00Z')} {...props} />,
  );
}

describe('ParcelsRenderer picked-up control', () => {
  it('makes the status of a ready parcel a button that offers to mark it', () => {
    const html = render([{ id: 'p1', status: 'ready_for_pickup', title: 'Paczka' }], handlers);

    expect(html).toContain('parcel-status-btn');
    expect(html).toContain('do odbioru');
    expect(html).toContain('aria-label="Oznacz jako odebraną"');
  });

  it('shows a marked parcel as odebrana with an undo button, without greying it out', () => {
    const html = render([{ id: 'p1', status: 'ready_for_pickup', title: 'Paczka' }], {
      ...handlers,
      getItemMark: () => 'picked_up',
    });

    expect(html).toContain('odebrana');
    expect(html).not.toContain('do odbioru');
    expect(html).toContain('aria-label="Cofnij oznaczenie odebrania"');
    expect(html).toContain('parcel-card');
    expect(html).not.toContain('is-pickup');
  });

  it('renders a parcel that Ryuk reports as picked up without a button', () => {
    const html = render([{ id: 'p1', status: 'picked_up' }], {
      ...handlers,
      getItemMark: () => 'picked_up',
    });

    expect(html).toContain('odebrana');
    expect(html).not.toContain('parcel-status-btn');
  });

  it('renders no button without mark handlers', () => {
    const html = render([{ id: 'p1', status: 'ready_for_pickup' }]);

    expect(html).toContain('do odbioru');
    expect(html).not.toContain('parcel-status-btn');
  });

  it('renders no button for a parcel in transit', () => {
    const html = render([{ id: 'p1', status: 'in_transit' }], handlers);

    expect(html).toContain('w drodze');
    expect(html).not.toContain('parcel-status-btn');
  });
});
