import { useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Chart } from '../components/Chart';
import type { ChartClickParams } from '../components/Chart';
import { formatDateTime, formatMoney } from '../format';
import { expenseBarOption, expensePieOption } from '../models/charts';
import {
  canExpandItems,
  formatWeekDiff,
  itemsForCategory,
  itemsForDay,
  readExpenses,
  toggleWeek,
  viewToggleLabel,
  weekToggleLabel,
  type DayBar,
  type ExpenseWeek,
  type WeekKey,
} from '../models/expenses';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, text } from './fields';
import { ExpandControlContext, HeaderSlotContext, SummarySlotContext } from './headerSlot';
import { MoneyRenderer } from './MoneyRenderer';

const DONUT_HEIGHT = 210;

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
  options: { value: T; label: string }[];
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
          onClick={(event) => {
            event.stopPropagation();
            onChange(option.value);
          }}
        >
          {option.label}
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
  const summarySlot = useContext(SummarySlotContext);
  const setCanExpand = useContext(ExpandControlContext);
  const [weekKey, setWeekKey] = useState<WeekKey>('current');
  const [mode, setMode] = useState<Mode>(model.current.byCategory.length > 0 ? 'category' : 'day');
  const [drill, setDrill] = useState<Drill>(null);
  const [showList, setShowList] = useState(false);

  const isChart = model.chart;
  const isDrilled = drill !== null;
  // Layout effect, so the card's expand button is hidden before the first paint
  useLayoutEffect(() => {
    setCanExpand(!isChart || canExpandItems({ isList: showList, isDrilled, weekKey }));
    return () => setCanExpand(true);
  }, [isChart, showList, isDrilled, weekKey, setCanExpand]);

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
      <div className="seg">
        <button
          type="button"
          className="is-on"
          disabled={!model.previous}
          title={weekKey === 'current' ? 'Pokaż poprzedni tydzień' : 'Pokaż bieżący tydzień'}
          onClick={(event) => {
            event.stopPropagation();
            setWeekKey(toggleWeek(weekKey, model.previous !== null));
            resetView();
          }}
        >
          {weekToggleLabel(weekKey)}
        </button>
      </div>
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

  const viewToggle = (
    <button
      type="button"
      className="summary-toggle"
      onClick={(event) => {
        event.stopPropagation();
        if (isDrilled) {
          setDrill(null);
          return;
        }
        setShowList(!showList);
      }}
    >
      {viewToggleLabel({ isList: showList, isDrilled })}
    </button>
  );

  let body: ReactNode;
  if (showList) {
    body = (
      <div className="tile-scroll">
        <ExpenseRows items={week.items} currency={currency} />
      </div>
    );
  } else if (drill?.kind === 'category') {
    body = (
      <div className="tile-scroll">
        <p className="muted">{drill.category}</p>
        <ExpenseRows items={itemsForCategory(week.items, drill.category)} currency={currency} />
      </div>
    );
  } else if (drill?.kind === 'day') {
    body = (
      <div className="tile-scroll">
        <p className="muted">{drill.label || 'Dzień'}</p>
        <ExpenseRows items={itemsForDay(week.items, drill.date)} currency={currency} />
      </div>
    );
  } else if (mode === 'category') {
    body =
      week.byCategory.length === 0 ? (
        <p className="muted">Brak podziału na kategorie</p>
      ) : (
        <div className="donut-layout">
          <div className="donut-wrap">
            <Chart
              height={DONUT_HEIGHT}
              option={expensePieOption(week.byCategory, currency)}
              onClick={(params: ChartClickParams) => {
                if (params.name) setDrill({ kind: 'category', category: params.name });
              }}
            />
            <div className="donut-center">
              <strong>{total !== null ? formatMoney(total, currency) : '—'}</strong>
            </div>
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
        </div>
      );
  } else {
    const openDay = (day: DayBar) => setDrill({ kind: 'day', date: day.date, label: day.label });
    body =
      week.byDay.length === 0 ? (
        <p className="muted">Brak podziału na dni</p>
      ) : (
        <Chart
          height={180}
          option={expenseBarOption(week.byDay, currency)}
          onClick={(params: ChartClickParams) => {
            const day = week.byDay[params.dataIndex ?? -1];
            if (day) openDay(day);
          }}
        />
      );
  }

  const range = [week.weekFrom ? formatDateTime(week.weekFrom) : null, week.weekTo ? formatDateTime(week.weekTo) : null]
    .filter(Boolean)
    .join(' – ');
  const until = weekKey === 'current' && model.dataUntil ? `dane do ${formatDateTime(model.dataUntil)}` : null;

  return (
    <>
      {slot ? createPortal(toggles, slot) : null}
      {summarySlot ? createPortal(viewToggle, summarySlot) : null}
      {body}
      {model.diff !== null ? <p className="compare">{formatWeekDiff(model.diff, currency)}</p> : null}
      {week.week || range || until ? (
        <p className="muted">{[week.week, range, until].filter(Boolean).join(' · ')}</p>
      ) : null}
    </>
  );
}
