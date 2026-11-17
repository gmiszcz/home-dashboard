import { Fragment, useState, type ReactNode } from 'react';

import {
  expenseColor,
  expenseStatusLabel,
  formatBarValue,
  formatExpenseTotal,
  formatShare,
  linearTrend,
  readExpensesTile,
  type ExpenseBlock,
  type ExpensesTileModel,
} from '../expensesTile';
import type { RendererProps } from '../types';

function BlockTitle({ title }: { title: string | null }) {
  if (!title) return null;
  return <h3 className="expense-block-title">{title}</h3>;
}

function KpiBlock({ block }: { block: Extract<ExpenseBlock, { type: 'kpi' }> }) {
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <ul className="expense-kpis">
        {block.items.map((item) => (
          <li
            key={item.label}
            className={`expense-kpi${item.emphasis ? ' is-emphasis' : ''}${item.tone ? ` is-${item.tone}` : ''}`}
          >
            <span className="expense-kpi-label">{item.label}</span>
            <strong className="expense-kpi-value">{item.value}</strong>
            {item.delta ? <span className="expense-kpi-delta">{item.delta}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function plotPoints(values: number[], count: number, max: number): string {
  return values
    .map((value, index) => {
      const x = count === 1 ? 0.5 : index + 0.5;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');
}

function BarsBlock({ block }: { block: Extract<ExpenseBlock, { type: 'bars' }> }) {
  const trend = block.trend ? linearTrend(block.series[0]?.values ?? []) : null;
  const plotted = [
    ...block.series.flatMap((series) => series.values),
    ...block.lineSeries.flatMap((series) => series.values),
    ...(trend ?? []),
  ];
  const max = Math.max(...plotted, 0) || 1;
  const columns = `repeat(${block.labels.length}, minmax(0, 1fr))`;
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <div className={`expense-bars-chart${block.showValues ? ' has-values' : ''}`}>
        {block.showValues ? (
          <div className="expense-bar-values" style={{ gridTemplateColumns: columns }}>
            {block.labels.map((label, index) => (
              <span key={`${label}-value-${index}`} className="expense-bar-value">
                {block.series.map((series, seriesIndex) => {
                  const value = series.values[index] ?? 0;
                  return (
                    <span key={`${series.name ?? 'series'}-${seriesIndex}`}>
                      <span className="expense-bar-value-full">{formatBarValue(value, block.unit, false)}</span>
                      <span className="expense-bar-value-short">{formatBarValue(value, block.unit, true)}</span>
                    </span>
                  );
                })}
              </span>
            ))}
          </div>
        ) : null}
        <div className="expense-bars-plot">
          <div className="expense-bars-tracks" style={{ gridTemplateColumns: columns }}>
            {block.labels.map((label, index) => (
              <div key={`${label}-bar-${index}`} className={`expense-bar-track${block.highlight === index ? ' is-on' : ''}`}>
                {block.series.map((series, seriesIndex) => {
                  const value = series.values[index] ?? 0;
                  const height = Math.max(value > 0 ? 6 : 0, (Math.max(value, 0) / max) * 100);
                  return (
                    <span
                      key={`${series.name ?? 'series'}-${seriesIndex}`}
                      className="expense-bar-fill"
                      style={{ height: `${height}%`, background: expenseColor(seriesIndex, series.color) }}
                      title={series.name ? `${series.name}: ${value}` : String(value)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          {trend || block.lineSeries.length > 0 ? (
            <svg
              className="expense-bars-overlay"
              viewBox={`0 0 ${block.labels.length} 100`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {block.lineSeries.map((series, index) => (
                <polyline
                  key={`${series.name ?? 'line'}-${index}`}
                  className="expense-line-series"
                  points={plotPoints(series.values, block.labels.length, max)}
                  fill="none"
                  stroke={expenseColor(index + 1, series.color)}
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {trend ? (
                <polyline
                  className="expense-trend-line"
                  points={plotPoints(trend, block.labels.length, max)}
                  fill="none"
                  stroke="#e2a53a"
                  strokeWidth="1.6"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          ) : null}
        </div>
        <div className="expense-bar-labels" style={{ gridTemplateColumns: columns }}>
          {block.labels.map((label, index) => (
            <span key={`${label}-${index}`} className="expense-bar-label">
              {label}
            </span>
          ))}
        </div>
      </div>
      {block.unit || block.series.some((series) => series.name) ? (
        <p className="expense-caption">
          {block.series
            .map((series) => series.name)
            .filter((name): name is string => Boolean(name))
            .join(' · ')}
          {block.unit ? ` (${block.unit})` : ''}
        </p>
      ) : null}
    </section>
  );
}

function DrilldownBlock({ block }: { block: Extract<ExpenseBlock, { type: 'drilldown' }> }) {
  const initial = block.items.find((item) => item.id === block.selected)?.id ?? block.items[0].id;
  const [selected, setSelected] = useState(initial);
  const current = block.items.find((item) => item.id === selected) ?? block.items[0];
  const bars: Extract<ExpenseBlock, { type: 'bars' }> = {
    type: 'bars',
    title: null,
    unit: block.unit,
    labels: block.labels,
    highlight: block.labels.length - 1,
    series: [{ name: current.label, values: current.values, color: null }],
    showValues: true,
    trend: true,
    lineSeries: [],
  };
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <div className="expense-drill-list" role="listbox" aria-label={block.title ?? 'Składniki'}>
        {block.items.map((item) => {
          const on = item.id === current.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`expense-drill-chip${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => setSelected(item.id)}
            >
              <span>{item.label}</span>
              {item.sharePct !== null ? <span className="muted">{formatShare(item.sharePct)}</span> : null}
              {item.change ? <span>{item.change}</span> : null}
            </button>
          );
        })}
      </div>
      <BarsBlock block={bars} />
    </section>
  );
}

function DonutBlock({ block }: { block: Extract<ExpenseBlock, { type: 'donut' }> }) {
  const total = block.segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0) || 1;
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <section className="expense-block expense-donut-block">
      <BlockTitle title={block.title} />
      <div className="expense-donut-row">
        <svg className="expense-donut" viewBox="0 0 42 42" role="img" aria-label={block.title ?? 'Wykres'}>
          {block.segments.map((segment, index) => {
            const length = (Math.max(segment.value, 0) / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={`${segment.label}-${index}`}
                r={radius}
                cx="21"
                cy="21"
                fill="none"
                stroke={expenseColor(index, segment.color)}
                strokeWidth="5"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 21 21)"
              />
            );
            offset += length;
            return circle;
          })}
          {block.center ? (
            <text x="21" y="22.5" textAnchor="middle" className="expense-donut-center">
              {block.center}
            </text>
          ) : null}
        </svg>
        <ul className="expense-legend">
          {block.segments.map((segment, index) => (
            <li key={`${segment.label}-${index}`}>
              <i style={{ background: expenseColor(index, segment.color) }} aria-hidden="true" />
              <span>{segment.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LineBlock({ block }: { block: Extract<ExpenseBlock, { type: 'line' }> }) {
  const width = 120;
  const height = 36;
  const min = Math.min(...block.values);
  const max = Math.max(...block.values);
  const span = max - min || 1;
  const points = block.values
    .map((value, index) => {
      const x = block.values.length === 1 ? width / 2 : (index / (block.values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <svg className="expense-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={block.title ?? 'Trend'}>
        <polyline points={points} fill="none" stroke="#7dcea0" strokeWidth="1.6" />
      </svg>
      <div className="expense-line-labels">
        {block.labels.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </section>
  );
}

function TableBlock({ block }: { block: Extract<ExpenseBlock, { type: 'table' }> }) {
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <table className="expense-table">
        <thead>
          <tr>
            {block.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <Fragment key={`row-${index}`}>
              <tr>
                {block.columns.map((column, cell) => (
                  <td key={column}>{row.cells[cell] ?? ''}</td>
                ))}
              </tr>
              {row.comment ? (
                <tr className="expense-comment-row">
                  <td colSpan={block.columns.length}>{row.comment}</td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ListBlock({ block }: { block: Extract<ExpenseBlock, { type: 'list' }> }) {
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <ul className="expense-lines">
        {block.items.map((item, index) => {
          const status = expenseStatusLabel(item.status);
          return (
            <li key={`${item.label}-${index}`} className="expense-line-item">
              <div className="expense-line-main">
                <span className="expense-line-label">{item.label}</span>
                <span className="expense-line-meta">
                  {item.date ? <span className="muted">{item.date}</span> : null}
                  {status ? <span className={`expense-status is-${item.status}`}>{status}</span> : null}
                  {item.amount ? <strong>{item.amount}</strong> : null}
                </span>
              </div>
              {item.comment ? <p className="expense-comment">{item.comment}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TextBlock({ block }: { block: Extract<ExpenseBlock, { type: 'text' }> }) {
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <p className="expense-note">{block.text}</p>
    </section>
  );
}

function renderBlock(block: ExpenseBlock, index: number): ReactNode {
  const key = `${block.type}-${index}`;
  switch (block.type) {
    case 'kpi':
      return <KpiBlock key={key} block={block} />;
    case 'bars':
      return <BarsBlock key={key} block={block} />;
    case 'drilldown':
      return <DrilldownBlock key={key} block={block} />;
    case 'donut':
      return <DonutBlock key={key} block={block} />;
    case 'line':
      return <LineBlock key={key} block={block} />;
    case 'table':
      return <TableBlock key={key} block={block} />;
    case 'list':
      return <ListBlock key={key} block={block} />;
    case 'text':
      return <TextBlock key={key} block={block} />;
    default:
      return null;
  }
}

function ExpenseBody({ model }: { model: ExpensesTileModel }) {
  const total = formatExpenseTotal(model.total, model.currency);
  return (
    <div className="expense-tile">
      {model.period || total ? (
        <div className="expense-head">
          {model.period ? <span className="muted">{model.period}</span> : null}
          {total ? <strong className="expense-total">{total}</strong> : null}
        </div>
      ) : null}
      {model.blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

export function ExpensesTileRenderer({ update }: RendererProps) {
  return <ExpenseBody model={readExpensesTile(update)} />;
}
