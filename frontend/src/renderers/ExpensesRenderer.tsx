import { useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Chart } from '../components/Chart';
import type { ChartClickParams } from '../components/Chart';
import { formatDateTime, formatMoney } from '../format';
import { expenseBarOption, expensePieOption } from '../models/charts';
import {
  formatWeekDiff,
  itemsForCategory,
  itemsForDay,
  readExpenses,
  type DayBar,
  type ExpenseWeek,
} from '../models/expenses';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, text } from './fields';
import { HeaderSlotContext } from './headerSlot';
import { MoneyRenderer } from './MoneyRenderer';

type WeekKey = 'current' | 'previous';
type Mode = 'category' | 'day';
type Drill =
  | { kind: 'category'; category: string }
  | { kind: 'day'; date: string; label: string }
  | null;

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; shortLabel?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-on' : undefined}
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!option.disabled) onChange(option.value);
          }}
        >
          {option.shortLabel ? (
            <>
              <span className="seg-full">{option.label}</span>
              <span className="seg-short">{option.shortLabel}</span>
            </>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}

function ExpenseRows({ items, currency }: { items: DashboardItem[]; currency: string }) {
  if (items.length === 0) return <p className="muted">Brak pozycji</p>;
  return (
    <ul className="item-list">
      {items.map((item, index) => {
        const value = amount(item, 'amount');
        const itemCurrency = text(item, 'currency') ?? currency;
        const date = text(item, 'date');
        const category = text(item, 'category');
        return (
          <li key={itemKey(item, index)}>
            <div className="item-main">
              <span className="item-title">{text(item, 'name') ?? text(item, 'title') ?? 'Pozycja'}</span>
              <span className="muted">
                {[category, date ? formatDateTime(date) : null].filter(Boolean).join(' · ')}
              </span>
            </div>
            {value !== null ? <strong className="price">{formatMoney(value, itemCurrency)}</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ExpensesRenderer({ update, now }: RendererProps) {
  const model = readExpenses(update);
  const slot = useContext(HeaderSlotContext);
  const [weekKey, setWeekKey] = useState<WeekKey>('current');
  const [mode, setMode] = useState<Mode>(model.current.byCategory.length > 0 ? 'category' : 'day');
  const [drill, setDrill] = useState<Drill>(null);
  const [showList, setShowList] = useState(false);

  if (!model.chart) return <MoneyRenderer update={update} now={now} />;

  const week: ExpenseWeek = weekKey === 'previous' && model.previous ? model.previous : model.current;
  const currency = model.currency;
  const total = week.total;

  const resetView = () => {
    setDrill(null);
    setShowList(false);
  };

  const toggles = (
    <>
      <Segmented
        label="Tydzień"
        value={weekKey}
        onChange={(next) => {
          setWeekKey(next);
          resetView();
        }}
        options={[
          { value: 'current', label: 'Ten tydzień', shortLabel: 'Ten tydz.' },
          { value: 'previous', label: 'Poprzedni', shortLabel: 'Poprz.', disabled: !model.previous },
        ]}
      />
      <Segmented
        label="Podział"
        value={mode}
        onChange={(next) => {
          setMode(next);
          resetView();
        }}
        options={[
          { value: 'category', label: 'Kategorie' },
          { value: 'day', label: 'Dni' },
        ]}
      />
    </>
  );

  const openList = () => {
    setDrill(null);
    setShowList(true);
  };

  let body: ReactNode;
  if (showList) {
    body = (
      <div className="tile-scroll">
        <button type="button" className="text-btn" onClick={resetView}>
          <i className="pi pi-arrow-left" aria-hidden="true" /> Wykres
        </button>
        <ExpenseRows items={week.items} currency={currency} />
      </div>
    );
  } else if (drill?.kind === 'category') {
    body = (
      <div className="tile-scroll">
        <button type="button" className="text-btn" onClick={() => setDrill(null)}>
          <i className="pi pi-arrow-left" aria-hidden="true" /> Wykres
        </button>
        <p className="muted">{drill.category}</p>
        <ExpenseRows items={itemsForCategory(week.items, drill.category)} currency={currency} />
      </div>
    );
  } else if (drill?.kind === 'day') {
    body = (
      <div className="tile-scroll">
        <button type="button" className="text-btn" onClick={() => setDrill(null)}>
          <i className="pi pi-arrow-left" aria-hidden="true" /> Wykres
        </button>
        <p className="muted">{drill.label || 'Dzień'}</p>
        <ExpenseRows items={itemsForDay(week.items, drill.date)} currency={currency} />
      </div>
    );
  } else if (mode === 'category') {
    body =
      week.byCategory.length === 0 ? (
        <p className="muted">Brak podziału na kategorie</p>
      ) : (
        <>
          <div className="donut-wrap">
            <Chart
              height={185}
              option={expensePieOption(week.byCategory, currency)}
              onClick={(params: ChartClickParams) => {
                if (params.name) setDrill({ kind: 'category', category: params.name });
              }}
            />
            <button type="button" className="donut-center" onClick={openList}>
              <strong>{total !== null ? formatMoney(total, currency) : '—'}</strong>
              <span>lista</span>
            </button>
          </div>
          <ul className="legend">
            {week.byCategory.map((slice) => (
              <li key={slice.category}>
                <button type="button" onClick={() => setDrill({ kind: 'category', category: slice.category })}>
                  <i style={{ background: slice.color }} aria-hidden="true" />
                  <span>{slice.category}</span>
                  <strong>{formatMoney(slice.amount, currency)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      );
  } else {
    const openDay = (day: DayBar) => setDrill({ kind: 'day', date: day.date, label: day.label });
    body =
      week.byDay.length === 0 ? (
        <p className="muted">Brak podziału na dni</p>
      ) : (
        <>
          <Chart
            height={180}
            option={expenseBarOption(week.byDay, currency)}
            onClick={(params: ChartClickParams) => {
              const day = week.byDay[params.dataIndex ?? -1];
              if (day) openDay(day);
            }}
          />
          <button type="button" className="text-btn" onClick={openList}>
            <i className="pi pi-list" aria-hidden="true" /> Wszystkie pozycje
          </button>
        </>
      );
  }

  const range = [week.weekFrom ? formatDateTime(week.weekFrom) : null, week.weekTo ? formatDateTime(week.weekTo) : null]
    .filter(Boolean)
    .join(' – ');
  const until = weekKey === 'current' && model.dataUntil ? `dane do ${formatDateTime(model.dataUntil)}` : null;

  return (
    <>
      {slot ? createPortal(toggles, slot) : null}
      {body}
      {model.diff !== null ? <p className="compare">{formatWeekDiff(model.diff, currency)}</p> : null}
      {week.week || range || until ? (
        <p className="muted">{[week.week, range, until].filter(Boolean).join(' · ')}</p>
      ) : null}
    </>
  );
}
