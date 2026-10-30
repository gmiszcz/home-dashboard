import { formatDateTime, formatMoney, plural } from '../format';
import { readSubscriptions, type Charge } from '../models/subscriptions';
import type { RendererProps } from '../types';
import { MoneyRenderer } from './MoneyRenderer';

function when(charge: Charge): string {
  if (charge.days === 0) return 'dziś';
  if (charge.days === 1) return 'jutro';
  return `za ${charge.days} ${plural(charge.days, 'dzień', 'dni', 'dni')}`;
}

export function SubscriptionsRenderer({ update, now }: RendererProps) {
  const model = readSubscriptions(update, now);
  if (!model.timeline) return <MoneyRenderer update={update} now={now} />;
  return (
    <>
      <ol className="timeline">
        {model.charges.map((charge) => (
          <li key={`${charge.date}-${charge.name}`} className={charge.soon ? 'is-soon' : undefined}>
            <div className="item-main">
              <span className="item-title">{charge.name}</span>
              <span className={charge.soon ? 'deadline' : 'muted'}>
                {formatDateTime(charge.date)} · {when(charge)}
              </span>
            </div>
            {charge.amount !== null ? (
              <strong className="price">{formatMoney(charge.amount, model.currency)}</strong>
            ) : null}
          </li>
        ))}
      </ol>
      {model.total !== null ? (
        <div className="totals">
          <span>
            Razem <strong>{formatMoney(model.total, model.currency)}</strong>
            {model.period ? <span className="muted"> / {model.period}</span> : null}
          </span>
        </div>
      ) : null}
    </>
  );
}
