import { Tag } from 'primereact/tag';

import { useClock } from '../hooks/useClock';
import { formatDateTime } from '../format';
import { deadlineCountdown } from '../models/parcels';
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
  const now = useClock(1000);
  const items = [...update.items].sort((left, right) => rank(left) - rank(right));
  return (
    <ul className="parcel-list">
      {items.map((item, index) => {
        const status = text(item, 'status') ?? '';
        const meta = PARCEL_STATUS[status];
        const pickup = status === 'ready_for_pickup';
        const point = record(item, 'pickup_point');
        const pointName = recordText(point, 'name');
        const pointAddress = recordText(point, 'address');
        const deadline = text(item, 'deadline');
        const code = text(item, 'pickup_code');
        const left = deadline ? deadlineCountdown(deadline, now) : null;
        return (
          <li key={itemKey(item, index)} className={`parcel-card${pickup ? ' is-pickup' : ''}`}>
            <div className="parcel-card-top">
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
              </div>
              <Tag value={meta?.label ?? status} severity={meta?.severity ?? 'secondary'} rounded />
            </div>
            {code ? <p className="pickup-code">{code}</p> : null}
            {deadline ? (
              <p className={left === 'termin minął' || pickup ? 'deadline' : 'muted'}>
                {left === 'termin minął'
                  ? 'Termin minął'
                  : left
                    ? `${pickup ? 'Odbiór za' : 'Za'} ${left}`
                    : `${pickup ? 'Odbiór do' : 'Termin'} ${formatDateTime(deadline)}`}
                {left && left !== 'termin minął' ? ` · ${formatDateTime(deadline)}` : null}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
