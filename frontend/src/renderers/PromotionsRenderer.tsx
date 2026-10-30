import { useState } from 'react';
import { Tag } from 'primereact/tag';

import { formatDateTime, formatMoney } from '../format';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, MaybeLink, safeHref, text } from './fields';

function PromoImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img className="promo-img" src={src} alt={alt} onError={() => setFailed(true)} />;
}

function PromoCard({ item }: { item: DashboardItem }) {
  const price = amount(item, 'price');
  const currency = text(item, 'currency') ?? 'PLN';
  const from = text(item, 'valid_from');
  const to = text(item, 'valid_to');
  const image = safeHref(text(item, 'image'));
  const title = text(item, 'product') ?? text(item, 'title') ?? 'Promocja';
  return (
    <article className="promo-card">
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
        </div>
      </div>
    </article>
  );
}

export function PromotionsRenderer({ update }: RendererProps) {
  return (
    <div className="promo-grid">
      {update.items.map((item, index) => (
        <PromoCard key={itemKey(item, index)} item={item} />
      ))}
    </div>
  );
}
