import { ConfirmDialog } from 'primereact/confirmdialog';
import { Tag } from 'primereact/tag';
import { useEffect, useState } from 'react';

import { useClock } from '../hooks/useClock';
import { formatDateTime } from '../format';
import { PICKED_UP_KIND } from '../marks';
import { deadlineCountdown } from '../models/parcels';
import { PARCEL_STATUS, parcelActionFor, parcelPickupState, type ParcelAction } from '../sections';
import type { DashboardItem, RendererProps } from '../types';
import { itemKey, MaybeLink, record, recordText, text } from './fields';

const ORDER = ['ready_for_pickup', 'in_transit', 'shipped', 'picked_up', 'returned'];

/** Confirmation that is open on this device only. Only the resulting mark is shared. */
interface PendingConfirm {
  itemId: string;
  action: ParcelAction;
  title: string;
}

const ACTION_LABEL: Record<ParcelAction, string> = {
  mark: 'Oznacz jako odebraną',
  unmark: 'Cofnij oznaczenie odebrania',
};

export function ParcelsRenderer({ update, getItemMark, onMarkItem, onUnackItem }: RendererProps) {
  const now = useClock(1000);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // Close the dialog when it went stale: another device already applied the change,
  // the parcel left the update, or Ryuk now reports a final status.
  useEffect(() => {
    if (pending && parcelActionFor(update.items, pending.itemId, getItemMark) !== pending.action) {
      setPending(null);
    }
  }, [pending, update.items, getItemMark]);

  const rank = (item: DashboardItem): number => {
    const index = ORDER.indexOf(parcelPickupState(item, getItemMark).status);
    return index === -1 ? ORDER.length : index;
  };
  const items = [...update.items].sort((left, right) => rank(left) - rank(right));

  const accept = () => {
    if (!pending) return;
    if (pending.action === 'mark') onMarkItem?.(update.section, pending.itemId, PICKED_UP_KIND);
    else onUnackItem?.(update.section, pending.itemId);
    setPending(null);
  };
  const marking = pending?.action !== 'unmark';
  const pendingTitle = pending?.title ?? '';

  return (
    <>
      <ul className="parcel-list">
        {items.map((item, index) => {
          const state = parcelPickupState(item, getItemMark);
          const meta = PARCEL_STATUS[state.status];
          const pickup = state.status === 'ready_for_pickup';
          const point = record(item, 'pickup_point');
          const pointName = recordText(point, 'name');
          const pointAddress = recordText(point, 'address');
          const deadline = text(item, 'deadline');
          const code = text(item, 'pickup_code');
          const left = deadline ? deadlineCountdown(deadline, now) : null;
          const title = text(item, 'title') ?? text(item, 'shop') ?? 'Przesyłka';
          const tag = (
            <Tag value={meta?.label ?? state.status} severity={meta?.severity ?? 'secondary'} rounded />
          );
          const { action, itemId } = state;
          return (
            <li key={itemKey(item, index)} className={`parcel-card${pickup ? ' is-pickup' : ''}`}>
              <div className="parcel-card-top">
                <div className="item-main">
                  <MaybeLink href={text(item, 'url')}>
                    <span className="item-title">{title}</span>
                  </MaybeLink>
                  <span className="muted">
                    {[text(item, 'carrier'), text(item, 'shop')].filter(Boolean).join(' · ')}
                  </span>
                  {pointName || pointAddress ? (
                    <span className="muted">{[pointName, pointAddress].filter(Boolean).join(', ')}</span>
                  ) : null}
                </div>
                {action && itemId && onMarkItem && onUnackItem ? (
                  <button
                    type="button"
                    className="parcel-status-btn"
                    aria-haspopup="dialog"
                    aria-label={ACTION_LABEL[action]}
                    title={ACTION_LABEL[action]}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPending({ itemId, action, title });
                    }}
                  >
                    {tag}
                  </button>
                ) : (
                  tag
                )}
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
      <ConfirmDialog
        visible={pending !== null}
        onHide={() => setPending(null)}
        header={marking ? 'Oznaczyć jako odebraną?' : 'Cofnąć oznaczenie odebrania?'}
        message={
          marking
            ? `${pendingTitle} zmieni status na „odebrana".`
            : `${pendingTitle} wróci do statusu przesłanego przez Ryuka.`
        }
        icon={marking ? 'pi pi-check-circle' : 'pi pi-undo'}
        acceptLabel={marking ? 'Odebrana' : 'Cofnij'}
        rejectLabel="Anuluj"
        accept={accept}
        reject={() => setPending(null)}
      />
    </>
  );
}
