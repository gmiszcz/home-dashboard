import { Divider } from 'primereact/divider';

import { formatDateTime, formatMoney } from '../format';
import type { RendererProps } from '../types';
import { amount, extraNumber, extraText, itemKey, text } from './fields';

export function MoneyRenderer({ update }: RendererProps) {
  const currency = extraText(update, 'currency') ?? 'PLN';
  const total = extraNumber(update, 'total');
  const balance = extraNumber(update, 'balance');
  const incoming = extraNumber(update, 'incoming');
  const outgoing = extraNumber(update, 'outgoing');
  return (
    <>
      <ul className="item-list">
        {update.items.map((item, index) => {
          const value = amount(item, 'amount');
          const itemCurrency = text(item, 'currency') ?? currency;
          const next = text(item, 'next_charge');
          return (
            <li key={itemKey(item, index)}>
              <div className="item-main">
                <span className="item-title">{text(item, 'name') ?? text(item, 'title') ?? 'Pozycja'}</span>
                <span className="muted">
                  {[text(item, 'period'), next ? `następne ${formatDateTime(next)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {value !== null ? <strong className="price">{formatMoney(value, itemCurrency)}</strong> : null}
            </li>
          );
        })}
      </ul>
      {total !== null || balance !== null ? <Divider /> : null}
      <div className="totals">
        {total !== null ? (
          <span>
            Razem <strong>{formatMoney(total, currency)}</strong>
          </span>
        ) : null}
        {balance !== null ? (
          <span>
            Saldo <strong>{formatMoney(balance, currency)}</strong>
          </span>
        ) : null}
        {incoming !== null ? <span className="muted">wpływy {formatMoney(incoming, currency)}</span> : null}
        {outgoing !== null ? <span className="muted">wydatki {formatMoney(outgoing, currency)}</span> : null}
      </div>
    </>
  );
}
