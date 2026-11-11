import { useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Chart } from '../components/Chart';
import { formatMoney } from '../format';
import { useAmountMode } from '../hooks/useAmountMode';
import { expensePieOption, payslipBarOption, payslipHistoryOption } from '../models/charts';
import {
  chartLines,
  formatShare,
  itemsForLine,
  monthLabel,
  percentBase,
  readPayslip,
  type PayslipChartMode,
  type PayslipLine,
  type PayslipPeriod,
} from '../models/payslip';
import type { DashboardItem, RendererProps } from '../types';
import { AmountModeToggle, AmountReadout } from './AmountModeToggle';
import { text } from './fields';
import { EnlargedContext, ExpandControlContext, HeaderSlotContext, SummarySlotContext } from './headerSlot';

const KIND_LABEL: Record<string, string> = {
  earning: 'składnik',
  deduction: 'potrącenie',
  addition: 'dodatek',
  net: 'na konto',
  info: 'informacja',
};

function signed(diff: number, currency: string): string {
  const body = formatMoney(Math.abs(diff), currency);
  if (diff > 0) return `+${body}`;
  if (diff < 0) return `−${body}`;
  return body;
}

function PayslipRows({ items, currency }: { items: DashboardItem[]; currency: string }) {
  if (items.length === 0) return <p className="muted">Brak pozycji</p>;
  return (
    <ul className="item-list">
      {items.map((item, index) => {
        const kind = text(item, 'kind') ?? '';
        const amount = typeof item.amount === 'number' ? item.amount : null;
        const note = text(item, 'note');
        return (
          <li key={text(item, 'id') ?? `${index}`}>
            <div className="item-main">
              <span className="item-title">{text(item, 'name') ?? text(item, 'title') ?? 'Pozycja'}</span>
              <span className="muted">
                {[KIND_LABEL[kind] ?? kind, note].filter(Boolean).join(' · ')}
              </span>
            </div>
            {amount !== null ? (
              <strong className="price">{formatMoney(amount, text(item, 'currency') ?? currency)}</strong>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function periodFacts(period: PayslipPeriod): string {
  const parts: string[] = [];
  if (period.employer) parts.push(period.employer);
  const month = monthLabel(period.month);
  if (month) parts.push(month);
  if (period.employmentRate !== null) {
    const rate = period.employmentRate <= 1 ? Math.round(period.employmentRate * 100) : period.employmentRate;
    parts.push(`etat ${rate}%`);
  }
  if (period.hoursNominal !== null) parts.push(`${period.hoursNominal} godz.`);
  if (period.hoursLeave !== null) parts.push(`urlop ${period.hoursLeave} godz.`);
  if (period.homeOfficeDays !== null) parts.push(`home office ${period.homeOfficeDays} dni`);
  return parts.join(' · ');
}

export function PayslipRenderer({ update }: RendererProps) {
  const model = useMemo(() => readPayslip(update), [update]);
  const slot = useContext(HeaderSlotContext);
  const summarySlot = useContext(SummarySlotContext);
  const setCanExpand = useContext(ExpandControlContext);
  const enlarged = useContext(EnlargedContext);
  useLayoutEffect(() => {
    setCanExpand(false);
    return () => setCanExpand(true);
  }, [setCanExpand]);
  const [periodKey, setPeriodKey] = useState<'current' | 'previous'>('current');
  const [mode, setMode] = useState<PayslipChartMode>('donut');
  const [amountMode, cycleAmountMode] = useAmountMode(update.section);
  const asPercent = amountMode === 'percent';
  const [showList, setShowList] = useState(false);
  const [drill, setDrill] = useState<PayslipLine | null>(null);
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useLayoutEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const period = periodKey === 'previous' && model.previous ? model.previous : model.current;
  const slices = chartLines(period.lines, mode);
  const currency = model.currency;
  const grossBase = percentBase(period.gross, slices);
  const donutSize = enlarged ? 320 : 210;

  const pieOption = useMemo(
    () => expensePieOption(
      slices.map((line) => ({ category: line.label, amount: line.amount, color: line.color })),
      currency,
    ),
    [slices, currency],
  );
  const barOption = useMemo(
    () => payslipBarOption(slices, currency, asPercent, grossBase, narrow),
    [slices, currency, asPercent, grossBase, narrow],
  );
  const historyOption = useMemo(
    () => payslipHistoryOption(model.history, currency),
    [model.history, currency],
  );

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
          title={model.previous ? 'Porównaj z poprzednim paskiem' : 'Brak poprzedniego paska'}
          aria-label={periodKey === 'current' ? 'Pokaż poprzedni miesiąc' : 'Pokaż bieżący miesiąc'}
          onClick={(event) => {
            event.stopPropagation();
            if (!model.previous) return;
            setPeriodKey(periodKey === 'current' ? 'previous' : 'current');
            resetView();
          }}
        >
          <span className="seg-full">{periodKey === 'current' ? 'Bieżący' : 'Poprzedni'}</span>
          <span className="seg-short">{periodKey === 'current' ? 'Ten mies.' : 'Poprz.'}</span>
        </button>
      </div>
      <button
        type="button"
        className="card-toggle-btn seg-btn"
        title={mode === 'donut' ? 'Wykres słupkowy podziału' : 'Wykres kołowy'}
        onClick={(event) => {
          event.stopPropagation();
          setMode(mode === 'donut' ? 'bar' : 'donut');
          setDrill(null);
        }}
      >
        <i className={`pi ${mode === 'donut' ? 'pi-chart-bar' : 'pi-chart-pie'}`} aria-hidden="true" />
        <span className="seg-full">{mode === 'donut' ? 'Słupki' : 'Koło'}</span>
        <span className="seg-short">{mode === 'donut' ? 'Słupki' : 'Koło'}</span>
      </button>
      <AmountModeToggle mode={amountMode} onCycle={cycleAmountMode} />
    </>
  );

  const viewToggle = (
    <button
      type="button"
      className="summary-toggle"
      onClick={(event) => {
        event.stopPropagation();
        if (drill) {
          setDrill(null);
          return;
        }
        setShowList(!showList);
      }}
    >
      {showList || drill ? 'Wykres' : 'Lista'}
    </button>
  );

  let body: ReactNode;
  if (showList) {
    body = (
      <div className="tile-scroll">
        <PayslipRows items={period.items} currency={currency} />
      </div>
    );
  } else if (drill) {
    const matched = itemsForLine(period.items, drill);
    body = (
      <div className="tile-scroll">
        <p className="muted">
          {drill.label} · {formatMoney(drill.amount, currency)} · {formatShare(drill.amount, grossBase)}
        </p>
        <PayslipRows items={matched.length > 0 ? matched : period.items.filter((item) => text(item, 'group') === drill.group)} currency={currency} />
      </div>
    );
  } else if (slices.length === 0) {
    body = <p className="muted">Brak podziału wynagrodzenia</p>;
  } else if (mode === 'donut') {
    body = (
      <div className="donut-layout payslip-donut">
        <div className="donut-wrap">
          <Chart
            height={donutSize}
            option={pieOption}
            ariaLabel={`Podział wynagrodzenia, na konto ${period.net !== null ? formatMoney(period.net, currency) : ''}`}
          />
          <div
            className="donut-center payslip-center"
            style={{ width: Math.round(donutSize * 0.5), fontSize: Math.max(11, Math.min(16, donutSize / 16)) }}
          >
            <strong>{period.net !== null ? formatMoney(period.net, currency) : '—'}</strong>
            <span>na konto</span>
          </div>
        </div>
        <ul className="legend">
          {slices.map((line) => (
            <li key={line.code}>
              <button type="button" title={line.label} onClick={() => setDrill(line)}>
                <i style={{ background: line.color }} aria-hidden="true" />
                <span>{line.label}</span>
                <AmountReadout mode={amountMode} value={line.amount} whole={grossBase} currency={currency} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <Chart
        height={narrow ? Math.max(280, slices.length * 28) : enlarged ? 360 : 240}
        option={barOption}
        ariaLabel="Słupki podziału brutto: na konto, podatki, składki i dodatki"
      />
    );
  }

  const facts = periodFacts(period);
  const ytd = period.ytdIncome !== null ? `dochód narastająco ${formatMoney(period.ytdIncome, currency)}` : null;

  return (
    <div className="payslip">
      {slot ? createPortal(toggles, slot) : null}
      {summarySlot ? createPortal(viewToggle, summarySlot) : null}
      {body}
      {model.history.length > 0 && !showList && !drill ? (
        <div className="payslip-history">
          <p className="muted">Historia brutto i na konto</p>
          <Chart height={enlarged ? 180 : 120} option={historyOption} ariaLabel="Historia brutto i kwoty na konto" />
        </div>
      ) : null}
      <div className="totals">
        {period.gross !== null ? (
          <span className="muted">
            brutto <strong>{formatMoney(period.gross, currency)}</strong>
          </span>
        ) : null}
        {period.net !== null ? (
          <span className="muted">
            na konto <strong>{formatMoney(period.net, currency)}</strong>
          </span>
        ) : null}
        {period.deductionsTotal !== null ? (
          <span className="muted">
            potrącenia <strong>{formatMoney(period.deductionsTotal, currency)}</strong>
          </span>
        ) : null}
      </div>
      {model.diffs.length > 0 ? (
        <ul className="payslip-diffs">
          {model.diffs.map((row) => (
            <li key={row.key}>
              <span>{row.label}</span>
              <strong className={row.diff > 0 ? 'is-up' : row.diff < 0 ? 'is-down' : ''}>{signed(row.diff, currency)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="compare">Brak porównania — pierwszy zapisany pasek.</p>
      )}
      {amountMode !== 'amount' ? <p className="muted">Procenty liczone od brutto.</p> : null}
      {facts || ytd ? <p className="muted">{[facts, ytd].filter(Boolean).join(' · ')}</p> : null}
    </div>
  );
}
