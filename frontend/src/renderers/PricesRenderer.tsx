import { Tag } from 'primereact/tag';

import { Chart } from '../components/Chart';
import { formatMoney } from '../format';
import { sparklineOption } from '../models/charts';
import { historyFor } from '../models/prices';
import { AVAILABILITY } from '../sections';
import type { RendererProps } from '../types';
import { amount, itemKey, MaybeLink, text } from './fields';

export function PricesRenderer({ update, now }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const price = amount(item, 'price');
        const threshold = amount(item, 'threshold');
        const currency = text(item, 'currency') ?? 'PLN';
        const availability = text(item, 'availability');
        const below = price !== null && threshold !== null && price <= threshold;
        const points = historyFor(update, item, now);
        return (
          <li key={itemKey(item, index)} className={below ? 'highlight' : undefined}>
            <div className="item-main">
              <MaybeLink href={text(item, 'url')}>
                <span className="item-title">{text(item, 'product') ?? text(item, 'title') ?? 'Produkt'}</span>
              </MaybeLink>
              <span className="muted">{text(item, 'store')}</span>
              {threshold !== null ? (
                <span className="muted">Próg {formatMoney(threshold, currency)}</span>
              ) : null}
              {points.length > 0 ? (
                <div className="spark">
                  <Chart height={46} option={sparklineOption(points.map((point) => point.price), threshold)} />
                </div>
              ) : null}
            </div>
            <div className="tag-row end">
              {price !== null ? <strong className="price">{formatMoney(price, currency)}</strong> : null}
              {below ? <Tag value="poniżej progu" severity="success" rounded /> : null}
              {availability ? (
                <Tag value={AVAILABILITY[availability] ?? availability} severity="secondary" rounded />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
