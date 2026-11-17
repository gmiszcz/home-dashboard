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
import type { DashboardItem, HiddenOfferRecord, RendererProps } from '../types';
import { MaybeLink, safeHref } from './fields';
import { ExpandControlContext, HeaderSlotContext } from './headerSlot';

type OfferView = 'list' | 'favorites' | 'hidden';

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

function mutedLine(item: DashboardItem): string | null {
  const parts = [offerLocation(item), offerDescription(item), offerNote(item)].filter(
    (part): part is string => Boolean(part),
  );
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
}: {
  item: DashboardItem;
  starred: boolean;
  onToggleStar?: () => void;
  onDismiss?: () => void;
  onHide?: () => void;
}) {
  const title = offerTitle(item);
  const href = offerUrl(item);
  const image = safeHref(offerImage(item));
  const price = offerPrice(item);
  const subtitle = mutedLine(item);
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
        {subtitle ? <span className="offer-sub muted">{subtitle}</span> : null}
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
        {onDismiss ? (
          <IconButton className="offer-skip-btn" label="Nie interesuje mnie" onClick={onDismiss}>
            <i className="pi pi-eye-slash" aria-hidden="true" />
          </IconButton>
        ) : null}
        {onHide ? (
          <IconButton className="offer-hide-btn" label="Ukryj" onClick={onHide}>
            <i className="pi pi-times" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
    </li>
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
  const favorites = (getSectionFavorites?.(update.section) ?? []).filter((favorite) =>
    visibleOffer(favorite.item_data),
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

  const card = (item: DashboardItem, key: string, starred: boolean, id: string | null) => (
    <OfferCard
      key={key}
      item={item}
      starred={starred}
      onToggleStar={id ? () => star(item, id, starred) : undefined}
      onDismiss={id ? () => dismiss(item) : undefined}
      onHide={id ? () => hide(item) : undefined}
    />
  );

  return (
    <>
      {slot ? createPortal(toolbar, slot) : <div className="offer-toolbar-fallback">{toolbar}</div>}
      {view === 'hidden' ? (
        hiddenRows.length === 0 ? (
          <p className="empty-section-hint">Brak ukrytych ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {hiddenRows.map((row) => (
              <HiddenRow
                key={row.id}
                row={row}
                onRestore={() => {
                  onRestoreHiddenOffer?.(update.section, row.id);
                  setView('list');
                }}
              />
            ))}
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

function HiddenRow({ row, onRestore }: { row: HiddenOfferRecord; onRestore: () => void }) {
  const title = row.title?.trim() || row.url || row.id;
  return (
    <li className="offer-hidden-row">
      <div className="offer-copy">
        <MaybeLink href={row.url}>
          <span className="item-title">{title}</span>
        </MaybeLink>
      </div>
      <button
        type="button"
        className="offer-restore-btn"
        onPointerDown={stopTileGesture}
        onClick={(event) => {
          stopTileGesture(event);
          onRestore();
        }}
      >
        <i className="pi pi-replay" aria-hidden="true" />
        <span>Przywróć</span>
      </button>
    </li>
  );
}
