import { useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  isOfferExcluded,
  isOfferHidden,
  offerBadges,
  offerDescription,
  offerId,
  offerImage,
  offerLocation,
  offerNote,
  offerPrice,
  offerReserved,
  offerTitle,
  offerUrl,
  sortOfferItems,
} from '../offers';
import type { DashboardItem, RendererProps } from '../types';
import { MaybeLink, safeHref } from './fields';
import { ExpandControlContext, HeaderSlotContext } from './headerSlot';

type OfferView = 'list' | 'favorites' | 'hidden' | 'excluded';

function stopTileGesture(event: { stopPropagation(): void }) {
  // Stop the tap at the control so the card does not start a drag and the link
  // is not followed. Leave the browser's own scrolling alone.
  event.stopPropagation();
}

function OfferPhoto({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className="offer-photo"
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function offerDetail(item: DashboardItem): string | null {
  const parts = [offerDescription(item), offerNote(item)].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function IconButton({
  className,
  label,
  pressed,
  onClick,
  children,
}: {
  className: string;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`offer-icon-btn ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={stopTileGesture}
      onClick={(event) => {
        stopTileGesture(event);
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function OfferCard({
  item,
  starred,
  onToggleStar,
  onDismiss,
  onHide,
  onRestore,
  restoreReplaces,
}: {
  item: DashboardItem;
  starred: boolean;
  onToggleStar?: () => void;
  onDismiss?: () => void;
  onHide?: () => void;
  onRestore?: () => void;
  /** Przywróć takes the place of the hide button or the not-interested button. */
  restoreReplaces?: 'hide' | 'dismiss';
}) {
  const title = offerTitle(item);
  const href = offerUrl(item);
  const image = safeHref(offerImage(item));
  const price = offerPrice(item);
  const location = offerLocation(item);
  const detail = offerDetail(item);
  const badges = offerBadges(item);
  const reserved = offerReserved(item);

  return (
    <li className={`offer-card${image ? ' has-photo' : ''}${starred ? ' is-favorite' : ''}`}>
      {image ? (
        <MaybeLink href={href}>
          <OfferPhoto src={image} title={title} />
        </MaybeLink>
      ) : null}
      <div className="offer-copy">
        <MaybeLink href={href}>
          <span className="item-title">{title}</span>
        </MaybeLink>
        {reserved ? <span className="offer-reserved">Zarezerwowane</span> : null}
        {price ? <span className="offer-price">{price}</span> : null}
        {location ? <span className="offer-location muted">{location}</span> : null}
        {detail ? <span className="offer-sub muted">{detail}</span> : null}
        {badges.length > 0 ? (
          <div className="offer-badges">
            {badges.map((badge, index) => (
              <span key={`${badge}-${index}`} className="offer-badge">
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="offer-actions">
        {onToggleStar ? (
          <IconButton
            className={`offer-star${starred ? ' is-starred' : ''}`}
            label={starred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych'}
            pressed={starred}
            onClick={onToggleStar}
          >
            <i className={`pi ${starred ? 'pi-star-fill' : 'pi-star'}`} aria-hidden="true" />
          </IconButton>
        ) : null}
        {onRestore && restoreReplaces === 'hide' ? (
          <RestoreButton onClick={onRestore} />
        ) : onHide ? (
          <IconButton className="offer-skip-btn" label="Ukryj" onClick={onHide}>
            <i className="pi pi-eye-slash" aria-hidden="true" />
          </IconButton>
        ) : null}
        {onRestore && restoreReplaces === 'dismiss' ? (
          <RestoreButton onClick={onRestore} />
        ) : onDismiss ? (
          <IconButton className="offer-hide-btn" label="Nie interesuje mnie" onClick={onDismiss}>
            <i className="pi pi-times" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
    </li>
  );
}

function RestoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="offer-restore-btn"
      title="Przywróć"
      aria-label="Przywróć"
      onPointerDown={stopTileGesture}
      onClick={(event) => {
        stopTileGesture(event);
        onClick();
      }}
    >
      <i className="pi pi-replay" aria-hidden="true" />
      <span>Przywróć</span>
    </button>
  );
}

function ToolbarButton({
  className,
  pressed,
  title,
  label,
  onClick,
}: {
  className: string;
  pressed: boolean;
  title: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`seg-btn ${className}${pressed ? ' is-on' : ''}`}
      title={title}
      aria-pressed={pressed}
      onPointerDown={stopTileGesture}
      onClick={(event) => {
        stopTileGesture(event);
        onClick();
      }}
    >
      <span className="seg-full">{label}</span>
      <span className="seg-short">{label}</span>
    </button>
  );
}

export function OffersRenderer({
  update,
  isItemStarred,
  onStarItem,
  onUnstarItem,
  getSectionFavorites,
  getSectionExclusions,
  onExcludeOffer,
  onRestoreOffer,
  getSectionHidden,
  onHideOffer,
  onRestoreHiddenOffer,
}: RendererProps) {
  const slot = useContext(HeaderSlotContext);
  const setCanExpand = useContext(ExpandControlContext);
  const [view, setView] = useState<OfferView>('list');

  // The "Pokaż jeszcze" control belongs to the live list, not to Ulubione or Ukryte.
  useEffect(() => {
    setCanExpand(view === 'list');
    return () => setCanExpand(true);
  }, [view, setCanExpand]);

  const exclusions = getSectionExclusions?.(update.section) ?? [];
  const hiddenRows = getSectionHidden?.(update.section) ?? [];
  const visibleOffer = (item: DashboardItem) =>
    !isOfferExcluded(item, exclusions) && !isOfferHidden(item, hiddenRows);
  const favorites = (getSectionFavorites?.(update.section) ?? []).filter(
    (favorite) => !isOfferExcluded(favorite.item_data, exclusions),
  );
  const visible = sortOfferItems(update.items.filter(visibleOffer), (id) =>
    Boolean(isItemStarred?.(update.section, id)),
  );

  const toggle = (next: OfferView) => setView((current) => (current === next ? 'list' : next));

  const toolbar = (
    <>
      <ToolbarButton
        className="offer-favorites-btn"
        pressed={view === 'favorites'}
        title={view === 'favorites' ? 'Pokaż oferty' : 'Pokaż ulubione oferty'}
        label={`★ ${favorites.length}`}
        onClick={() => toggle('favorites')}
      />
      <ToolbarButton
        className="offer-hidden-btn"
        pressed={view === 'hidden'}
        title={view === 'hidden' ? 'Pokaż oferty' : 'Pokaż ukryte oferty'}
        label={`Ukryte ${hiddenRows.length}`}
        onClick={() => toggle('hidden')}
      />
      <ToolbarButton
        className="offer-excluded-btn"
        pressed={view === 'excluded'}
        title={view === 'excluded' ? 'Pokaż oferty' : 'Pokaż odrzucone oferty'}
        label={`Odrzucone ${exclusions.length}`}
        onClick={() => toggle('excluded')}
      />
    </>
  );

  const dismiss = (item: DashboardItem) => {
    const id = offerId(item);
    if (!id) return;
    onExcludeOffer?.(update.section, id, offerUrl(item), offerTitle(item));
  };

  const hide = (item: DashboardItem) => {
    const id = offerId(item);
    if (!id) return;
    onHideOffer?.(update.section, id, offerUrl(item), offerTitle(item));
  };

  const star = (item: DashboardItem, id: string, starred: boolean) => {
    if (starred) onUnstarItem?.(update.section, id);
    else onStarItem?.(update.section, id, item);
  };

  const card = (
    item: DashboardItem,
    key: string,
    starred: boolean,
    id: string | null,
    restoreReplaces?: 'hide' | 'dismiss',
  ) => (
    <OfferCard
      key={key}
      item={item}
      starred={starred}
      onToggleStar={id ? () => star(item, id, starred) : undefined}
      onDismiss={id && restoreReplaces !== 'dismiss' ? () => dismiss(item) : undefined}
      onHide={id && restoreReplaces !== 'hide' ? () => hide(item) : undefined}
      onRestore={
        id && restoreReplaces
          ? () => {
              if (restoreReplaces === 'hide') onRestoreHiddenOffer?.(update.section, id);
              else onRestoreOffer?.(update.section, id);
              setView('list');
            }
          : undefined
      }
      restoreReplaces={restoreReplaces}
    />
  );

  const storedOffer = (id: string, url: string | null, title: string | null): DashboardItem => {
    const live = update.items.find((item) => {
      const itemId = offerId(item);
      if (itemId !== null && itemId === id) return true;
      const itemUrl = offerUrl(item);
      return url !== null && itemUrl !== null && itemUrl === url;
    });
    if (live) return live;
    return { id, title: title?.trim() || url || id, url: url ?? undefined };
  };

  return (
    <>
      {slot ? createPortal(toolbar, slot) : <div className="offer-toolbar-fallback">{toolbar}</div>}
      {view === 'hidden' ? (
        hiddenRows.length === 0 ? (
          <p className="empty-section-hint">Brak ukrytych ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {hiddenRows.map((row) => {
              const item = storedOffer(row.id, row.url, row.title);
              const starred = Boolean(isItemStarred?.(update.section, row.id));
              return card(item, row.id, starred, row.id, 'hide');
            })}
          </ul>
        )
      ) : null}
      {view === 'excluded' ? (
        exclusions.length === 0 ? (
          <p className="empty-section-hint">Brak odrzuconych ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {exclusions.map((row) => {
              const item = storedOffer(row.offer_id, row.url, row.title);
              const starred = Boolean(isItemStarred?.(update.section, row.offer_id));
              return card(item, row.offer_id, starred, row.offer_id, 'dismiss');
            })}
          </ul>
        )
      ) : null}
      {view === 'favorites' ? (
        favorites.length === 0 ? (
          <p className="empty-section-hint">Brak ulubionych ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {favorites.map((favorite) => {
              const live = update.items.find((item) => offerId(item) === favorite.item_id);
              const item = live ?? favorite.item_data;
              return card(item, favorite.item_id, true, favorite.item_id);
            })}
          </ul>
        )
      ) : null}
      {view === 'list' ? (
        visible.length === 0 ? (
          <p className="empty-section-hint">Brak ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {visible.map((item, index) => {
              const id = offerId(item);
              const starred = Boolean(id && isItemStarred?.(update.section, id));
              return card(item, id ?? `offer-${index}`, starred, id);
            })}
          </ul>
        )
      ) : null}
    </>
  );
}
