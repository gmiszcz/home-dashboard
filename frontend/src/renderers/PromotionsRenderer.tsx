import { useState } from 'react';
import { Tag } from 'primereact/tag';

import { formatDateTime, formatMoney } from '../format';
import { SKIPPED_KIND } from '../marks';
import { promotionItemId } from '../sections';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, MaybeLink, safeHref, text } from './fields';

function PromoImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="promo-img" src={src} alt={alt} onError={() => setFailed(true)} />;
}

function PromoCard({
  item,
  isSkipped,
  onToggleSkipped,
}: {
  item: DashboardItem;
  isSkipped: boolean;
  onToggleSkipped?: () => void;
}) {
  const price = amount(item, 'price');
  const currency = text(item, 'currency') ?? 'PLN';
  const from = text(item, 'valid_from');
  const to = text(item, 'valid_to');
  const image = safeHref(text(item, 'image'));
  const title = text(item, 'product') ?? text(item, 'title') ?? 'Promocja';
  return (
    <article className={`promo-card${isSkipped ? ' is-skipped' : ''}`}>
      {image ? <PromoImage src={image} alt="" /> : null}
      <div className="item-main">
        <MaybeLink href={text(item, 'url')}>
          <span className="item-title">{title}</span>
        </MaybeLink>
        <span className="muted">{text(item, 'store')}</span>
        {from ? <span className="muted">od {formatDateTime(from)}</span> : null}
        <div className="promo-meta">
          {price !== null ? <strong className="price">{formatMoney(price, currency)}</strong> : null}
          {to ? <Tag value={`do ${formatDateTime(to)}`} severity="info" rounded /> : null}
          {isSkipped ? <Tag value="Pominięte" severity="secondary" rounded /> : null}
        </div>
      </div>
      {onToggleSkipped ? (
        <button
          type="button"
          className="promo-skip-btn"
          title={isSkipped ? 'Przywróć promocję' : 'Nie interesuje mnie, pomiń promocję'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSkipped();
          }}
        >
          <i className={`pi ${isSkipped ? 'pi-replay' : 'pi-eye-slash'}`} aria-hidden="true" />
          <span>{isSkipped ? 'Przywróć' : 'Pomiń'}</span>
        </button>
      ) : null}
    </article>
  );
}

export function PromotionsRenderer({ update, getItemMark, onMarkItem, onUnackItem }: RendererProps) {
  return (
    <div className="promo-grid">
      {update.items.map((item, index) => {
        const id = promotionItemId(item);
        const isSkipped = id !== null && getItemMark?.(update.section, id) === SKIPPED_KIND;
        const canToggle = id !== null && onMarkItem !== undefined && onUnackItem !== undefined;
        return (
          <PromoCard
            key={itemKey(item, index)}
            item={item}
            isSkipped={isSkipped}
            onToggleSkipped={
              canToggle
                ? () =>
                    isSkipped
                      ? onUnackItem(update.section, id)
                      : onMarkItem(update.section, id, SKIPPED_KIND)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
