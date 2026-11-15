import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  isOfferExcluded,
  offerBadges,
  offerDescription,
  offerId,
  offerImage,
  offerLocation,
  offerNote,
  offerPrice,
  offerTitle,
  offerUrl,
  sortOfferItems,
} from '../offers';
import type { DashboardItem, ExclusionRecord, RendererProps } from '../types';
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

function OfferCard({
  item,
  starred,
  onToggleStar,
  onHide,
}: {
  item: DashboardItem;
  starred: boolean;
  onToggleStar?: () => void;
  onHide?: () => void;
}) {
  const title = offerTitle(item);
  const href = offerUrl(item);
  const image = safeHref(offerImage(item));
  const price = offerPrice(item);
  const location = offerLocation(item);
  const description = offerDescription(item);
  const note = offerNote(item);
  const badges = offerBadges(item);

  return (
    <li className={`offer-card${image ? ' has-photo' : ''}${starred ? ' is-favorite' : ''}`}>
      <div className="offer-body">
        {image ? (
          <MaybeLink href={href}>
            <OfferPhoto src={image} title={title} />
          </MaybeLink>
        ) : null}
        <div className="offer-copy">
          <MaybeLink href={href}>
            <span className="item-title">{title}</span>
          </MaybeLink>
          {price || location ? (
            <div className="offer-meta">
              {price ? <span className="offer-price">{price}</span> : null}
              {location ? <span className="muted">{location}</span> : null}
            </div>
          ) : null}
          {description ? <span className="item-desc offer-desc">{description}</span> : null}
          {badges.length > 0 ? (
            <div className="offer-badges">
              {badges.map((badge, index) => (
                <span key={`${badge}-${index}`} className="offer-badge">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          {note ? <span className="offer-note">{note}</span> : null}
        </div>
      </div>
      <div className="offer-actions">
        {onToggleStar ? (
          <button
            type="button"
            className={`star-btn offer-star${starred ? ' is-starred' : ''}`}
            title={starred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych'}
            aria-label={starred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych'}
            aria-pressed={starred}
            onPointerDown={stopTileGesture}
            onClick={(event) => {
              stopTileGesture(event);
              onToggleStar();
            }}
          >
            <i className={`pi ${starred ? 'pi-star-fill' : 'pi-star'}`} aria-hidden="true" />
          </button>
        ) : null}
        {onHide ? (
          <button
            type="button"
            className="offer-hide-btn"
            title="Nie interesuje mnie"
            onPointerDown={stopTileGesture}
            onClick={(event) => {
              stopTileGesture(event);
              onHide();
            }}
          >
            <i className="pi pi-eye-slash" aria-hidden="true" />
            <span>Nie interesuje mnie</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ToolbarButton({
  className,
  pressed,
  title,
  full,
  short,
  onClick,
}: {
  className: string;
  pressed: boolean;
  title: string;
  full: string;
  short: string;
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
      <span className="seg-full">{full}</span>
      <span className="seg-short">{short}</span>
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
  const favorites = (getSectionFavorites?.(update.section) ?? []).filter(
    (favorite) => !isOfferExcluded(favorite.item_data, exclusions),
  );
  const visible = sortOfferItems(
    update.items.filter((item) => !isOfferExcluded(item, exclusions)),
    (id) => Boolean(isItemStarred?.(update.section, id)),
  );

  const toggle = (next: OfferView) => setView((current) => (current === next ? 'list' : next));

  const toolbar = (
    <>
      <ToolbarButton
        className="offer-favorites-btn"
        pressed={view === 'favorites'}
        title={view === 'favorites' ? 'Pokaż oferty' : 'Pokaż ulubione oferty'}
        full={`Ulubione (${favorites.length})`}
        short={`★ ${favorites.length}`}
        onClick={() => toggle('favorites')}
      />
      <ToolbarButton
        className="offer-hidden-btn"
        pressed={view === 'hidden'}
        title={view === 'hidden' ? 'Pokaż oferty' : 'Pokaż ukryte oferty'}
        full={`Ukryte (${exclusions.length})`}
        short={`Ukryte ${exclusions.length}`}
        onClick={() => toggle('hidden')}
      />
    </>
  );

  const hide = (item: DashboardItem) => {
    const id = offerId(item);
    if (!id) return;
    onExcludeOffer?.(update.section, id, offerUrl(item), offerTitle(item));
  };

  const star = (item: DashboardItem, id: string, starred: boolean) => {
    if (starred) onUnstarItem?.(update.section, id);
    else onStarItem?.(update.section, id, item);
  };

  return (
    <>
      {slot ? createPortal(toolbar, slot) : <div className="offer-toolbar-fallback">{toolbar}</div>}
      {view === 'hidden' ? (
        exclusions.length === 0 ? (
          <p className="empty-section-hint">Brak ukrytych ofert</p>
        ) : (
          <ul className="item-list offer-list">
            {exclusions.map((row) => (
              <HiddenRow
                key={row.offer_id}
                row={row}
                onRestore={() => {
                  onRestoreOffer?.(update.section, row.offer_id);
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
              return (
                <OfferCard
                  key={favorite.item_id}
                  item={item}
                  starred
                  onToggleStar={() => onUnstarItem?.(update.section, favorite.item_id)}
                  onHide={() => hide(item)}
                />
              );
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
              return (
                <OfferCard
                  key={id ?? `offer-${index}`}
                  item={item}
                  starred={starred}
                  onToggleStar={id ? () => star(item, id, starred) : undefined}
                  onHide={id ? () => hide(item) : undefined}
                />
              );
            })}
          </ul>
        )
      ) : null}
    </>
  );
}

function HiddenRow({ row, onRestore }: { row: ExclusionRecord; onRestore: () => void }) {
  const title = row.title?.trim() || row.url || row.offer_id;
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
