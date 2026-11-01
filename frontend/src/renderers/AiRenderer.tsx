import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag } from 'primereact/tag';

import { formatRelative } from '../format';
import { ackItemKey } from '../sections';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, text } from './fields';
import { HeaderSlotContext } from './headerSlot';

export function AiRenderer({
  update,
  now,
  isItemAcked,
  onAckItem,
  onUnackItem,
  isItemStarred,
  onStarItem,
  onUnstarItem,
  getSectionFavorites,
}: RendererProps) {
  const slot = useContext(HeaderSlotContext);
  const [showFavorites, setShowFavorites] = useState(false);

  const favorites = getSectionFavorites?.(update.section) ?? [];
  const hasFavorites = favorites.length > 0;

  const headerToggle =
    slot && hasFavorites
      ? createPortal(
          <button
            type="button"
            className={`card-toggle-btn seg-btn${showFavorites ? ' is-on' : ''}`}
            title={showFavorites ? 'Pokaż bieżące artykuły' : 'Pokaż zapisane ulubione artykuły'}
            onClick={(e) => {
              e.stopPropagation();
              setShowFavorites((prev) => !prev);
            }}
          >
            <i
              className={`pi ${showFavorites ? 'pi-list' : 'pi-star-fill'}`}
              style={showFavorites ? undefined : { color: 'var(--amber)' }}
              aria-hidden="true"
            />
            <span className="seg-full">{showFavorites ? 'Bieżące' : `Ulubione (${favorites.length})`}</span>
            <span className="seg-short">{showFavorites ? 'Bieżące' : `★ ${favorites.length}`}</span>
          </button>,
          slot
        )
      : null;

  if (showFavorites) {
    return (
      <>
        {headerToggle}
        {favorites.length === 0 ? (
          <p className="empty-section-hint">Brak zapisanych ulubionych artykułów</p>
        ) : (
          <ul className="item-list favorites-list">
            {favorites.map((fav, index) => {
              const item = fav.item_data;
              const title = text(item, 'headline') ?? text(item, 'title') ?? 'Temat';
              const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : '';
              const itemText = text(item, 'text');
              const why = text(item, 'why_it_matters');
              const tryIt = text(item, 'try_it');
              const source = text(item, 'source');

              return (
                <li key={fav.item_id || index} className="stack">
                  <div className="item-main">
                    <div className="item-title-row">
                      <MaybeLink href={text(item, 'url')}>
                        <span className="item-title">{title}</span>
                      </MaybeLink>
                      {priority === 'high' ? <Tag value="ważne" severity="warning" rounded /> : null}
                    </div>
                    {itemText ? <span className="item-desc">{itemText}</span> : null}
                    <div className="item-meta-row">
                      {source ? <span className="muted">{source}</span> : null}
                      <span className="saved-at-badge" title={fav.saved_at}>
                        <i className="pi pi-bookmark" aria-hidden="true" /> Zapisano {formatRelative(fav.saved_at, now)}
                      </span>
                    </div>
                    {why ? <span className="why-matters">{why}</span> : null}
                    {tryIt ? (
                      <span className="try">
                        <i className="pi pi-arrow-right" aria-hidden="true" /> {tryIt}
                      </span>
                    ) : null}
                  </div>
                  <div className="read-actions">
                    <button
                      type="button"
                      className="star-btn is-starred"
                      title="Usuń z ulubionych"
                      aria-label="Usuń z ulubionych"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnstarItem?.(update.section, fav.item_id);
                      }}
                    >
                      <i className="pi pi-star-fill" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      {headerToggle}
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
          const isStarred = Boolean(ackKey && isItemStarred?.(update.section, ackKey));

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
              <div className="read-actions">
                {ackKey && (onStarItem || onUnstarItem) ? (
                  <button
                    type="button"
                    className={`star-btn${isStarred ? ' is-starred' : ''}`}
                    title={isStarred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych na stałe'}
                    aria-label={isStarred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych na stałe'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isStarred) {
                        onUnstarItem?.(update.section, ackKey);
                      } else {
                        onStarItem?.(update.section, ackKey, item);
                      }
                    }}
                  >
                    <i className={`pi ${isStarred ? 'pi-star-fill' : 'pi-star'}`} aria-hidden="true" />
                  </button>
                ) : null}
                {ackKey && (isRead ? onUnackItem : onAckItem) ? (
                  isRead ? (
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
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
