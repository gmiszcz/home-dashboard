import { useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Chart } from '../components/Chart';
import { formatMoney } from '../format';
import { useAmountMode } from '../hooks/useAmountMode';
import { chartTheme, energyPriceOption, energyTrendOption, expensePieOption, payslipBarOption } from '../models/charts';
import {
  ESTIMATE_NOTE,
  compositionSlices,
  formatKwh,
  formatUnitPrice,
  isUsageInvoice,
  polishDate,
  readEnergy,
  shareWhole,
  shortPeriod,
  sumUsage,
  type EnergyComposition,
  type EnergyInvoice,
} from '../models/energy';
import type { AmountMode } from '../models/amountMode';
import type { RendererProps } from '../types';
import { AmountModeToggle, AmountReadout } from './AmountModeToggle';
import { GenericRenderer } from './GenericRenderer';
import { EnlargedContext, ExpandControlContext, HeaderSlotContext } from './headerSlot';

type EnergyView = 'list' | 'bars' | 'donut' | 'trend';

/**
 * Monthly columns stay vertical, the same way the payslip chart draws them.
 * Set this to 'horizontal' when the bars should run sideways.
 */
const BAR_ORIENTATION = 'vertical' as const;

const VIEWS: { id: EnergyView; label: string }[] = [
  { id: 'list', label: 'Lista' },
  { id: 'bars', label: 'Słupki' },
  { id: 'donut', label: 'Koło' },
  { id: 'trend', label: 'Trend' },
];

const KIND_LABEL: Record<string, string> = {
  invoice: 'faktura',
  correction: 'korekta',
  note: 'nota',
  other: 'inne',
  inne: 'inne',
};

const STATUS_LABEL: Record<string, string> = {
  paid: 'opłacona',
  settled: 'rozliczona',
  unpaid: 'nieopłacona',
  due: 'do zapłaty',
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  return STATUS_LABEL[status] ?? status;
}

function EnergyTotals({
  part,
  mode,
  currency,
}: {
  part: EnergyComposition;
  mode: AmountMode;
  currency: string;
}) {
  const whole = shareWhole(part);
  return (
    <div className="totals">
      <span className="muted">
        sprzedaż <AmountReadout mode={mode} value={part.sales} whole={whole} currency={currency} />
      </span>
      <span className="muted">
        dystrybucja <AmountReadout mode={mode} value={part.distribution} whole={whole} currency={currency} />
      </span>
      <span className="muted">
        razem <strong>{formatMoney(part.total, currency)}</strong>
      </span>
      <span className="muted">{formatKwh(part.kwh)}</span>
    </div>
  );
}

function InvoiceList({
  invoices,
  mode,
  currency,
}: {
  invoices: EnergyInvoice[];
  mode: AmountMode;
  currency: string;
}) {
  if (invoices.length === 0) return <p className="muted">Brak dokumentów</p>;
  return (
    <ul className="item-list energy-list">
      {invoices.map((invoice) => {
        const usage = isUsageInvoice(invoice);
        const part = sumUsage(usage ? [invoice] : []);
        const whole = shareWhole(part);
        const period =
          invoice.periodFrom || invoice.periodTo
            ? [polishDate(invoice.periodFrom), polishDate(invoice.periodTo)].filter(Boolean).join('–')
            : null;
        const facts = [
          kindLabel(invoice.kind),
          period,
          usage && invoice.kwh !== null ? formatKwh(invoice.kwh) : null,
          statusLabel(invoice.status),
          invoice.issued ? `wystawiono ${polishDate(invoice.issued)}` : null,
          invoice.due ? `termin ${polishDate(invoice.due)}` : null,
        ].filter(Boolean);
        return (
          <li key={invoice.number}>
            <div className="item-main">
              <span className="item-title">{invoice.number}</span>
              <span className="muted">{facts.join(' · ')}</span>
              {usage ? (
                <span className="muted">
                  sprzedaż <AmountReadout mode={mode} value={part.sales} whole={whole} currency={currency} />
                  {' · '}
                  dystrybucja <AmountReadout mode={mode} value={part.distribution} whole={whole} currency={currency} />
                </span>
              ) : (
                <span className="muted">Poza wykresem{invoice.note ? ` · ${invoice.note}` : ''}</span>
              )}
            </div>
            {invoice.total !== null ? (
              <strong className="price">{formatMoney(invoice.total, currency)}</strong>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function EnergyRenderer(props: RendererProps) {
  const model = useMemo(() => readEnergy(props.update), [props.update]);
  if (!model.structured) return <GenericRenderer {...props} />;
  return <EnergyTile {...props} />;
}

function EnergyTile({ update }: RendererProps) {
  const model = useMemo(() => readEnergy(update), [update]);
  const slot = useContext(HeaderSlotContext);
  const setCanExpand = useContext(ExpandControlContext);
  const enlarged = useContext(EnlargedContext);
  const [view, setView] = useState<EnergyView>('trend');
  const [focus, setFocus] = useState('year');
  const [amountMode, cycleAmountMode] = useAmountMode(update.section);
  useLayoutEffect(() => {
    setCanExpand(false);
    return () => setCanExpand(true);
  }, [setCanExpand]);

  const currency = model.currency;
  const focused = model.usage.find((invoice) => invoice.number === focus) ?? null;
  const donutPart = focused ? sumUsage([focused]) : model.year;
  const slices = compositionSlices(donutPart);
  const whole = shareWhole(donutPart);
  const donutSize = enlarged ? 320 : 210;
  const pieOption = useMemo(
    () => expensePieOption(slices, currency),
    [slices, currency],
  );
  const barOption = useMemo(
    () =>
      payslipBarOption(
        model.months.map((month) => ({
          label: month.label,
          amount: month.total,
          color: chartTheme.amber,
        })),
        currency,
        false,
        model.year.total,
        BAR_ORIENTATION,
        ESTIMATE_NOTE,
      ),
    [model.months, model.year.total, currency],
  );
  const trendOption = useMemo(
    () => energyTrendOption(model.months, currency),
    [model.months, currency],
  );
  const priceOption = useMemo(() => energyPriceOption(model.prices), [model.prices]);
  const priceChange =
    model.prices.length >= 2
      ? {
          last: model.prices[model.prices.length - 1],
          previous: model.prices[model.prices.length - 2],
        }
      : null;

  const toggles = (
    <>
      <div className="seg" role="group" aria-label="Widok prądu">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={view === entry.id ? 'is-on' : undefined}
            aria-pressed={view === entry.id}
            onClick={(event) => {
              event.stopPropagation();
              setView(entry.id);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {view === 'donut' ? (
        <select
          className="seg-select"
          aria-label="Zakres wykresu kołowego"
          value={focused ? focused.number : 'year'}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation();
            setFocus(event.target.value);
          }}
        >
          <option value="year">Rok</option>
          {model.usage.map((invoice) => (
            <option key={invoice.number} value={invoice.number}>
              {shortPeriod(invoice.periodFrom, invoice.periodTo)}
            </option>
          ))}
        </select>
      ) : null}
      <AmountModeToggle mode={amountMode} onCycle={cycleAmountMode} />
    </>
  );

  let body: ReactNode;
  if (view === 'list') {
    body = <InvoiceList invoices={model.invoices} mode={amountMode} currency={currency} />;
  } else if (view === 'bars') {
    body =
      model.months.length === 0 ? (
        <p className="muted">Brak faktur do wykresu</p>
      ) : (
        <>
          <p className="muted">Koszt na miesiąc (szacunek — faktura podzielona według dni)</p>
          <Chart
            height={enlarged ? 360 : 260}
            option={barOption}
            ariaLabel="Słupki kosztu prądu na miesiące, szacunek z podziału faktur według dni"
          />
        </>
      );
  } else if (view === 'donut') {
    body =
      slices.length === 0 ? (
        <p className="muted">Brak podziału kosztów</p>
      ) : (
        <div className="donut-layout payslip-donut">
          <div className="donut-wrap">
            <Chart
              height={donutSize}
              option={pieOption}
              ariaLabel={`Podział kosztu prądu, sprzedaż energii i dystrybucja, razem ${formatMoney(donutPart.total, currency)}`}
            />
            <div
              className="donut-center payslip-center"
              style={{ width: Math.round(donutSize * 0.5), fontSize: Math.max(11, Math.min(16, donutSize / 16)) }}
            >
              <strong>{formatMoney(donutPart.total, currency)}</strong>
              <span>{focused ? shortPeriod(focused.periodFrom, focused.periodTo) : 'razem'}</span>
            </div>
          </div>
          <ul className="legend">
            {slices.map((slice) => (
              <li key={slice.category}>
                <button type="button" title={slice.category} onClick={(event) => event.stopPropagation()}>
                  <i style={{ background: slice.color }} aria-hidden="true" />
                  <span>{slice.category}</span>
                  <AmountReadout mode={amountMode} value={slice.amount} whole={whole} currency={currency} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
  } else {
    body =
      model.months.length === 0 ? (
        <p className="muted">Brak faktur do wykresu</p>
      ) : (
        <div className="payslip-history">
          <p className="muted">Miesiąc do miesiąca · kWh i koszt (szacunek)</p>
          <Chart
            height={enlarged ? 280 : 210}
            option={trendOption}
            ariaLabel="Trend zużycia i kosztu prądu miesiąc do miesiąca, szacunek"
          />
          {model.prices.length > 0 ? (
            <>
              <p className="muted">Cena brutto za kWh (razem ÷ kWh) na okres faktury</p>
              <Chart
                height={enlarged ? 220 : 180}
                option={priceOption}
                ariaLabel="Cena za kilowatogodzinę na kolejne okresy faktur"
              />
            </>
          ) : null}
          {priceChange ? (
            <p className="compare">
              Ostatni okres {formatUnitPrice(priceChange.last.price)}, poprzedni {formatUnitPrice(priceChange.previous.price)}{' '}
              ({priceChange.last.price >= priceChange.previous.price ? '+' : '−'}
              {formatUnitPrice(Math.abs(Math.round((priceChange.last.price - priceChange.previous.price) * 100) / 100)).replace(
                ' zł/kWh',
                '',
              )}
              )
            </p>
          ) : null}
        </div>
      );
  }

  const totalsPart = view === 'donut' ? donutPart : model.year;

  return (
    <div className="energy">
      {slot ? createPortal(toggles, slot) : null}
      {body}
      {view === 'list' ? null : <EnergyTotals part={totalsPart} mode={amountMode} currency={currency} />}
      {amountMode !== 'amount' && view !== 'trend' ? (
        <p className="muted">Procent to udział sprzedaży i dystrybucji w kwocie razem.</p>
      ) : null}
    </div>
  );
}
