import { Tag } from 'primereact/tag';

import { formatDateTime } from '../format';
import { PARCEL_STATUS } from '../sections';
import type { DashboardItem, RendererProps } from '../types';
import { itemKey, MaybeLink, record, recordText, text } from './fields';

const ORDER = ['ready_for_pickup', 'in_transit', 'shipped', 'picked_up', 'returned'];

function rank(item: DashboardItem): number {
  const status = text(item, 'status') ?? '';
  const index = ORDER.indexOf(status);
  return index === -1 ? ORDER.length : index;
}

export function ParcelsRenderer({ update }: RendererProps) {
  const items = [...update.items].sort((left, right) => rank(left) - rank(right));
  return (
    <ul className="item-list">
      {items.map((item, index) => {
        const status = text(item, 'status') ?? '';
        const meta = PARCEL_STATUS[status];
        const pickup = status === 'ready_for_pickup';
        const point = record(item, 'pickup_point');
        const pointName = recordText(point, 'name');
        const pointAddress = recordText(point, 'address');
        const deadline = text(item, 'deadline');
        const code = text(item, 'pickup_code');
        return (
          <li key={itemKey(item, index)} className={pickup ? 'highlight' : undefined}>
            <div className="item-main">
              <MaybeLink href={text(item, 'url')}>
                <span className="item-title">{text(item, 'title') ?? text(item, 'shop') ?? 'Przesyłka'}</span>
              </MaybeLink>
              <span className="muted">
                {[text(item, 'carrier'), text(item, 'shop')].filter(Boolean).join(' · ')}
              </span>
              {pointName || pointAddress ? (
                <span className="muted">{[pointName, pointAddress].filter(Boolean).join(', ')}</span>
              ) : null}
              {deadline ? (
                <span className={pickup ? 'deadline' : 'muted'}>
                  {pickup ? 'Odbiór do ' : 'Termin '}
                  {formatDateTime(deadline)}
                </span>
              ) : null}
              {code ? <span className="code">Kod odbioru {code}</span> : null}
            </div>
            <Tag value={meta?.label ?? status} severity={meta?.severity ?? 'secondary'} rounded />
          </li>
        );
      })}
    </ul>
  );
}
