import { Tag } from 'primereact/tag';
import { ackItemKey } from '../sections';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, text } from './fields';

export function AiRenderer({ update, isItemAcked, onAckItem, onUnackItem }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const title = text(item, 'headline') ?? text(item, 'title') ?? 'Temat';
        const isPinned = Boolean(item.pinned);
        const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : '';
        const itemText = text(item, 'text');
        const why = text(item, 'why_it_matters');
        const tryIt = text(item, 'try_it');
        const source = text(item, 'source');
        const ackKey = ackItemKey(item);
        const isRead = Boolean(ackKey && isItemAcked?.(update.section, ackKey));

        return (
          <li
            key={itemKey(item, index)}
            className={`stack${isPinned ? ' is-pinned' : ''}${isRead ? ' is-read' : ''}`}
          >
            <div className="item-main">
              <div className="item-title-row">
                {isPinned ? (
                  <span className="pinned-badge" title="Przypięte">
                    <i className="pi pi-bookmark-fill" aria-hidden="true" />
                  </span>
                ) : null}
                <MaybeLink href={text(item, 'url')}>
                  <span className="item-title">{title}</span>
                </MaybeLink>
                {priority === 'high' ? (
                  <Tag value="ważne" severity="warning" rounded />
                ) : null}
              </div>
              {itemText ? <span className="item-desc">{itemText}</span> : null}
              {source ? <span className="muted">{source}</span> : null}
              {why ? <span className="why-matters">{why}</span> : null}
              {tryIt ? (
                <span className="try">
                  <i className="pi pi-arrow-right" aria-hidden="true" /> {tryIt}
                </span>
              ) : null}
            </div>
            {ackKey && (isRead ? onUnackItem : onAckItem) ? (
              <div className="read-actions">
                {isRead ? (
                  <button
                    type="button"
                    className="read-undo-btn"
                    title="Cofnij oznaczenie jako przeczytane"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnackItem?.(update.section, ackKey);
                    }}
                  >
                    <i className="pi pi-undo" aria-hidden="true" />
                    <span>Cofnij</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sec-ack-btn"
                    title="Oznacz jako przeczytane"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAckItem?.(update.section, ackKey);
                    }}
                  >
                    <i className="pi pi-check" aria-hidden="true" />
                    <span>Przeczytane</span>
                  </button>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
