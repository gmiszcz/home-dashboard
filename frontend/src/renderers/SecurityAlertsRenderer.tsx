import { Tag } from 'primereact/tag';

import { formatDateTime } from '../format';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, More, text } from './fields';

const LIMIT = 10;

export function SecurityAlertsRenderer({ update, onAckItem, isItemAcked }: RendererProps) {
  if (update.items.length === 0) return null;
  const visible = update.items.slice(0, LIMIT);

  return (
    <>
      <ul className="item-list sec-alerts-list">
        {visible.map((item, index) => {
          const id = item.id ? String(item.id) : undefined;
          const isAcked = Boolean(id && isItemAcked?.(update.section, id));
          const title = text(item, 'title') ?? text(item, 'name') ?? 'Alert';
          const status = text(item, 'status');
          const note = text(item, 'note') ?? text(item, 'details');
          const date = text(item, 'date');
          const href = text(item, 'url');
          const priority = text(item, 'priority');

          return (
            <li
              key={itemKey(item, index)}
              className={`sec-alert-item${isAcked ? ' is-acked' : ''}`}
            >
              <div className="item-main">
                <div className="sec-alert-header">
                  <MaybeLink href={href}>
                    <span className="item-title">{title}</span>
                  </MaybeLink>
                  {priority ? (
                    <Tag
                      value={priority}
                      severity={priority === 'high' || priority === 'critical' ? 'danger' : 'info'}
                      rounded
                    />
                  ) : null}
                  {status ? (
                    <Tag
                      value={status}
                      severity={status === 'open' ? 'warning' : 'secondary'}
                      rounded
                    />
                  ) : null}
                </div>
                {note ? <span className="sec-alert-note">{note}</span> : null}
                {date ? <span className="muted">{formatDateTime(date)}</span> : null}
              </div>

              <div className="sec-alert-actions">
                {isAcked ? (
                  <span className="sec-acked-indicator" title="Przeczytane">
                    <i className="pi pi-check" aria-hidden="true" />
                    <span>Przeczytane</span>
                  </span>
                ) : id && onAckItem ? (
                  <button
                    type="button"
                    className="sec-ack-btn"
                    title="Oznacz alert jako przeczytany"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAckItem(update.section, id);
                    }}
                  >
                    <i className="pi pi-check" aria-hidden="true" />
                    <span>Przeczytane</span>
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <More total={update.items.length} shown={visible.length} />
    </>
  );
}
