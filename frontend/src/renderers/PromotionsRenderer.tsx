import { formatDateTime, formatMoney } from '../format';
import type { RendererProps } from '../types';
import { amount, itemKey, MaybeLink, text } from './fields';

export function PromotionsRenderer({ update }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const price = amount(item, 'price');
        const currency = text(item, 'currency') ?? 'PLN';
        const from = text(item, 'valid_from');
        const to = text(item, 'valid_to');
        return (
          <li key={itemKey(item, index)}>
            <div className="item-main">
              <MaybeLink href={text(item, 'url')}>
                <span className="item-title">{text(item, 'product') ?? text(item, 'title') ?? 'Promocja'}</span>
              </MaybeLink>
              <span className="muted">{text(item, 'store')}</span>
              {from || to ? (
                <span className="muted">
                  {from ? formatDateTime(from) : '…'} – {to ? formatDateTime(to) : '…'}
                </span>
              ) : null}
            </div>
            {price !== null ? <strong className="price">{formatMoney(price, currency)}</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}
