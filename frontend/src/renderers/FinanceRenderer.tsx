import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';

import { Chart } from '../components/Chart';
import { formatDateTime, formatMoney } from '../format';
import { financeBarOption } from '../models/charts';
import { readFinance } from '../models/finance';
import type { RendererProps } from '../types';
import { amount, itemKey, text } from './fields';

export function FinanceRenderer({ update }: RendererProps) {
  const model = readFinance(update);
  const { currency, progress } = model;
  return (
    <>
      {progress.outgoing !== null ? (
        <div className="budget">
          {progress.hasBudget && progress.percent !== null ? (
            <ProgressBar
              className={`finance-bar${progress.over ? ' is-over' : ''}`}
              value={progress.percent}
              showValue={false}
            />
          ) : null}
          <p className="budget-label">
            {progress.hasBudget && progress.budget !== null ? (
              <>
                Wydatki <strong>{formatMoney(progress.outgoing, currency)}</strong>
                {' z '}
                <strong>{formatMoney(progress.budget, currency)}</strong>
                {progress.over ? <span className="over"> powyżej budżetu</span> : null}
              </>
            ) : (
              <>
                Wydatki <strong>{formatMoney(progress.outgoing, currency)}</strong>
              </>
            )}
          </p>
        </div>
      ) : null}
      {model.forecast !== null ? (
        <p className="muted">Prognoza końca miesiąca {formatMoney(model.forecast, currency)}</p>
      ) : null}
      {model.days.length > 0 ? (
        <Chart height={140} option={financeBarOption(model.days, currency)} />
      ) : null}
      <ul className="item-list">
        {update.items.map((item, index) => {
          const value = amount(item, 'amount');
          const itemCurrency = text(item, 'currency') ?? currency;
          const next = text(item, 'next_charge');
          const direction = text(item, 'direction');
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
              <div className="tag-row end">
                {direction === 'in' ? <Tag value="wpływ" severity="success" rounded /> : null}
                {direction === 'out' ? <Tag value="wydatek" severity="warning" rounded /> : null}
                {value !== null ? <strong className="price">{formatMoney(value, itemCurrency)}</strong> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {model.balance !== null || model.incoming !== null ? (
        <div className="totals">
          {model.balance !== null ? (
            <span>
              Saldo <strong>{formatMoney(model.balance, currency)}</strong>
            </span>
          ) : null}
          {model.incoming !== null ? (
            <span className="muted">wpływy {formatMoney(model.incoming, currency)}</span>
          ) : null}
          {model.outgoing !== null ? (
            <span className="muted">wydatki {formatMoney(model.outgoing, currency)}</span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
