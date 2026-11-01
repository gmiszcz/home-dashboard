import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Chart } from '../components/Chart';
import type { ChartClickParams } from '../components/Chart';
import { formatDateTime, formatMoney } from '../format';
import { expenseBarOption, expenseChartLabel, expensePieOption } from '../models/charts';
import {
  canExpandItems,
  formatPeriodDiff,
  itemsForCategoryOrSubcategory,
  itemsForDay,
  periodToggleLabel,
  periodToggleShortLabel,
  readExpenses,
  readReceipt,
  subcategoryMeta,
  toggleWeek,
  viewToggleLabel,
  type ExpenseWeek,
  type PeriodType,
  type WeekKey,
} from '../models/expenses';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, text } from './fields';
import { ExpandControlContext, HeaderSlotContext, SummarySlotContext } from './headerSlot';
import { MoneyRenderer } from './MoneyRenderer';

const DONUT_HEIGHT = 185;

/** Share of the period total, e.g. "32,4%". */
function formatShare(value: number, whole: number): string {
  if (!whole || whole <= 0) return '0%';
  return `${((value / whole) * 100).toFixed(1).replace('.', ',')}%`;
}

type Mode = 'category' | 'day';
type Drill =
  | { kind: 'category'; category: string }
  | { kind: 'day'; date: string; label: string }
  | null;

function ExpenseRows({ items, currency }: { items: DashboardItem[]; currency: string }) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedSubKey, setExpandedSubKey] = useState<string | null>(null);

  if (items.length === 0) return <p className="muted">Brak pozycji</p>;
  return (
    <ul className="item-list">
      {items.map((item, index) => {
        const id = itemKey(item, index);
        const value = amount(item, 'amount');
        const itemCurrency = text(item, 'currency') ?? currency;
        const date = text(item, 'date');
        const category = text(item, 'category');
        const receipt = item.receipt ? readReceipt(item.receipt) : null;
        const hasReceipt = Boolean(receipt && receipt.breakdown && receipt.breakdown.length > 0);
        const isExpanded = expandedItemId === id;

        return (
          <li
            key={id}
            className={`expense-item-row${hasReceipt ? ' has-receipt' : ''}${isExpanded ? ' is-expanded' : ''}`}
            onClick={() => {
              if (hasReceipt) {
                setExpandedItemId(isExpanded ? null : id);
                setExpandedSubKey(null);
              }
            }}
          >
            <div className="item-main">
              <div className="item-title-row">
                <span className="item-title">{text(item, 'name') ?? text(item, 'title') ?? 'Pozycja'}</span>
                {hasReceipt ? (
                  <span className="receipt-tag" title="Pozycja z paragonem (kliknij, aby rozwinąć)">
                    <i className="pi pi-receipt" aria-hidden="true" /> paragon
                  </span>
                ) : null}
              </div>
              <span className="muted">
                {[category, date ? formatDateTime(date) : null].filter(Boolean).join(' · ')}
              </span>

              {isExpanded && receipt && receipt.breakdown ? (
                <div className="receipt-card-details" onClick={(e) => e.stopPropagation()}>
                  <div className="receipt-meta-header">
                    {receipt.store ? <span className="receipt-store">{receipt.store}</span> : null}
                    {receipt.time ? <span className="receipt-time">{formatDateTime(receipt.time)}</span> : null}
                    {receipt.discounts_total ? (
                      <span className="receipt-discount">rabaty: −{formatMoney(receipt.discounts_total, itemCurrency)}</span>
                    ) : null}
                  </div>
                  <ul className="receipt-subcategories-list">
                    {receipt.breakdown.map((sub) => {
                      const isSubExpanded = expandedSubKey === sub.subcategory;
                      const meta = subcategoryMeta(sub.subcategory, sub.label);
                      const hasLines = sub.lines && sub.lines.length > 0;
                      return (
                        <li key={sub.subcategory} className="receipt-subcategory-item">
                          <div
                            className={`receipt-sub-header${hasLines ? ' clickable' : ''}`}
                            onClick={() => {
                              if (hasLines) {
                                setExpandedSubKey(isSubExpanded ? null : sub.subcategory);
                              }
                            }}
                          >
                            <div className="receipt-sub-left">
                              <span className="receipt-sub-dot" style={{ background: meta.color }} />
                              <span className="receipt-sub-icon">{meta.icon}</span>
                              <span className="receipt-sub-name">{meta.label}</span>
                              {sub.count ? <span className="receipt-sub-count">({sub.count})</span> : null}
                            </div>
                            <div className="receipt-sub-right">
                              <strong className="receipt-sub-amount">{formatMoney(sub.amount, itemCurrency)}</strong>
                              {hasLines ? (
                                <i className={`pi ${isSubExpanded ? 'pi-chevron-up' : 'pi-chevron-down'} receipt-chevron`} />
                              ) : null}
                            </div>
                          </div>
                          {isSubExpanded && sub.lines ? (
                            <ul className="receipt-lines-list">
                              {sub.lines.map((line, lIdx) => (
                                <li key={lIdx} className="receipt-line-item">
                                  <span className="line-name">{line.name}</span>
                                  <span className="line-calc">
                                    {line.qty && line.unit_price ? (
                                      <span className="line-unit">
                                        {line.qty} {line.unit ?? 'szt'} × {formatMoney(line.unit_price, itemCurrency)}
                                      </span>
                                    ) : null}
                                    <strong className="line-amount">{formatMoney(line.amount, itemCurrency)}</strong>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
            {value !== null ? <strong className="price">{formatMoney(value, itemCurrency)}</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}

export interface ExpensesRendererProps extends RendererProps {
  periodType?: PeriodType;
}

export function ExpensesRenderer({ update, now, periodType: propPeriodType }: ExpensesRendererProps) {
  const monthlySections = update.section === 'finance' || update.section === 'expenses_monthly';
  const periodType: PeriodType = propPeriodType ?? (monthlySections ? 'month' : 'week');
  const model = useMemo(() => readExpenses(update), [update]);
  const slot = useContext(HeaderSlotContext);
  const summarySlot = useContext(SummarySlotContext);
  const setCanExpand = useContext(ExpandControlContext);
  const [weekKey, setWeekKey] = useState<WeekKey>('current');
  const [mode, setMode] = useState<Mode>(model.current.byCategory.length > 0 ? 'category' : 'day');
  const [drill, setDrill] = useState<Drill>(null);
  const [showList, setShowList] = useState(false);
  const [isDetailed, setIsDetailed] = useState(false);
  const legendRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [donutSize, setDonutSize] = useState(DONUT_HEIGHT);

  const isChart = model.chart;
  const isDrilled = drill !== null;
  // Layout effect, so the card's expand button is hidden before the first paint
  useLayoutEffect(() => {
    setCanExpand(!isChart || canExpandItems({ isList: showList, isDrilled, weekKey }));
    return () => setCanExpand(true);
  }, [isChart, showList, isDrilled, weekKey, setCanExpand]);

  const week: ExpenseWeek = weekKey === 'previous' && model.previous ? model.previous : model.current;
  const currency = model.currency;

  const activeSlices = useMemo(() => {
    if (isDetailed && week.detailedSlices.length > 0) {
      return week.detailedSlices;
    }
    return week.byCategory;
  }, [isDetailed, week]);

  const pieOption = useMemo(() => expensePieOption(activeSlices, currency), [activeSlices, currency]);
  const barOption = useMemo(() => expenseBarOption(week.byDay, currency), [week, currency]);

  // The donut follows its parent: it grows with the legend height, capped by its own column width
  const showsDonut = isChart && !showList && drill === null && mode === 'category' && activeSlices.length > 0;
  useLayoutEffect(() => {
    if (!showsDonut) return;
    const legend = legendRef.current;
    const wrap = wrapRef.current;
    if (!legend || !wrap) return;
    const measure = () => {
      const height = legend.offsetHeight;
      const width = wrap.offsetWidth || height;
      const next = Math.round(Math.max(DONUT_HEIGHT, Math.min(height, width)));
      setDonutSize((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(legend);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [showsDonut, activeSlices]);

  const handleCategoryClick = useCallback((params: ChartClickParams) => {
    if (params.name) setDrill({ kind: 'category', category: params.name });
  }, []);

  const handleDayClick = useCallback(
    (params: ChartClickParams) => {
      const day = week.byDay[params.dataIndex ?? -1];
      if (day) setDrill({ kind: 'day', date: day.date, label: day.label });
    },
    [week]
  );

  if (!model.chart) return <MoneyRenderer update={update} now={now} />;

  const total = week.total;
  const slicesTotal = activeSlices.reduce((sum, slice) => sum + slice.amount, 0);

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
          title={
            weekKey === 'current'
              ? (periodType === 'month' ? 'Pokaż poprzedni miesiąc' : 'Pokaż poprzedni tydzień')
              : (periodType === 'month' ? 'Pokaż bieżący miesiąc' : 'Pokaż bieżący tydzień')
          }
          aria-label={`${periodToggleLabel(weekKey, periodType)}: ${weekKey === 'current' ? (periodType === 'month' ? 'pokaż poprzedni miesiąc' : 'pokaż poprzedni tydzień') : (periodType === 'month' ? 'pokaż bieżący miesiąc' : 'pokaż bieżący tydzień')}`}
          onClick={(event) => {
            event.stopPropagation();
            setWeekKey(toggleWeek(weekKey, model.previous !== null));
            resetView();
          }}
        >
          <span className="seg-full">{periodToggleLabel(weekKey, periodType)}</span>
          <span className="seg-short">{periodToggleShortLabel(weekKey, periodType)}</span>
        </button>
      </div>

      <button
        type="button"
        className="card-toggle-btn seg-btn"
        title={mode === 'category' ? 'Przełącz na widok dni' : 'Przełącz na widok kategorii'}
        onClick={(event) => {
          event.stopPropagation();
          setMode(mode === 'category' ? 'day' : 'category');
          resetView();
        }}
      >
        <i className={`pi ${mode === 'category' ? 'pi-calendar' : 'pi-chart-pie'}`} aria-hidden="true" />
        <span className="seg-full">{mode === 'category' ? 'Dni' : 'Kategorie'}</span>
        <span className="seg-short">{mode === 'category' ? 'Dni' : 'Kat.'}</span>
      </button>

      {mode === 'category' && week.hasReceipts ? (
        <button
          type="button"
          className={`card-toggle-btn seg-btn${isDetailed ? ' is-on' : ''}`}
          title={isDetailed ? 'Widok standardowy: kategorie ogólne' : 'Rozbij na podkategorie z paragonów'}
          onClick={(event) => {
            event.stopPropagation();
            setIsDetailed(!isDetailed);
            setDrill(null);
          }}
        >
          <i className="pi pi-receipt" aria-hidden="true" />
          <span>{isDetailed ? 'Ogólne' : 'Szczegóły'}</span>
        </button>
      ) : null}
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

  // A period with no spending at all: no items, no categories, and every day bar is zero.
  // This happens early in a month before the first bank statement arrives. We show a clear
  // message instead of an empty donut or a flat bar chart, but keep the period toggle so the
  // user can still switch to the previous period, where the data lives.
  const hasAnySpending =
    week.items.length > 0 ||
    week.byCategory.length > 0 ||
    week.byDay.some((day) => day.amount > 0) ||
    (week.total !== null && week.total > 0);
  const emptyPeriodMessage = periodType === 'month' ? 'Brak danych za ten miesiąc' : 'Brak danych za ten tydzień';

  let body: ReactNode;
  if (!hasAnySpending) {
    body = <p className="muted">{emptyPeriodMessage}</p>;
  } else if (showList) {
    body = (
      <div className="tile-scroll">
        <ExpenseRows items={week.items} currency={currency} />
      </div>
    );
  } else if (drill?.kind === 'category') {
    body = (
      <div className="tile-scroll">
        <p className="muted">{drill.category}</p>
        <ExpenseRows items={itemsForCategoryOrSubcategory(week.items, drill.category)} currency={currency} />
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
      activeSlices.length === 0 ? (
        <p className="muted">Brak podziału na kategorie</p>
      ) : (
        <div className="donut-layout">
          <div className="donut-wrap" ref={wrapRef}>
            <Chart
              height={donutSize}
              option={pieOption}
              ariaLabel={expenseChartLabel('category', week, currency)}
              onClick={handleCategoryClick}
            />
            <div
              className="donut-center"
              style={{ width: Math.round(donutSize * 0.4), fontSize: Math.max(11, Math.min(20, donutSize / 14)) }}
            >
              <strong>{total !== null ? formatMoney(total, currency) : '—'}</strong>
            </div>
          </div>
          <ul className="legend" ref={legendRef}>
            {activeSlices.map((slice) => (
              <li key={slice.category}>
                <button
                  type="button"
                  title={`Pokaż transakcje: ${slice.category}`}
                  onClick={() => setDrill({ kind: 'category', category: slice.category })}
                >
                  <i style={{ background: slice.color }} aria-hidden="true" />
                  <span>{slice.category}</span>
                  <strong>{formatMoney(slice.amount, currency)}</strong>
                  <em className="legend-pct">{formatShare(slice.amount, slicesTotal)}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
  } else {
    body =
      week.byDay.length === 0 ? (
        <p className="muted">Brak podziału na dni</p>
      ) : (
        <Chart
          height={180}
          option={barOption}
          ariaLabel={expenseChartLabel('day', week, currency)}
          onClick={handleDayClick}
        />
      );
  }

  const from = week.weekFrom ?? week.monthFrom;
  const to = week.weekTo ?? week.monthTo;
  const range = [from ? formatDateTime(from) : null, to ? formatDateTime(to) : null]
    .filter(Boolean)
    .join(' – ');
  const until = weekKey === 'current' && model.dataUntil ? `dane do ${formatDateTime(model.dataUntil)}` : null;

  return (
    <>
      {slot ? createPortal(toggles, slot) : null}
      {summarySlot ? createPortal(viewToggle, summarySlot) : null}
      {body}
      {model.diff !== null ? <p className="compare">{formatPeriodDiff(model.diff, currency, periodType)}</p> : null}
      {week.incoming != null || week.balance != null ? (
        <div className="totals">
          {week.incoming != null ? (
            <span className="muted">
              wpływy <strong>{formatMoney(week.incoming, currency)}</strong>
            </span>
          ) : null}
          {week.balance != null ? (
            <span className="muted">
              saldo <strong>{formatMoney(week.balance, currency)}</strong>
            </span>
          ) : null}
        </div>
      ) : null}
      {week.forecast !== null && week.forecast !== undefined ? (
        <p className="muted">Prognoza końca miesiąca {formatMoney(week.forecast, currency)}</p>
      ) : null}
      {week.week || week.month || range || until ? (
        <p className="muted">{[week.week || week.month, range, until].filter(Boolean).join(' · ')}</p>
      ) : null}
    </>
  );
}
