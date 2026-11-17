import type { ReactNode } from 'react';

import {
  expenseColor,
  expenseStatusLabel,
  formatExpenseTotal,
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
          <li key={item.label}>
            <span className="expense-kpi-label">{item.label}</span>
            <strong className="expense-kpi-value">{item.value}</strong>
            {item.delta ? <span className="expense-kpi-delta">{item.delta}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BarsBlock({ block }: { block: Extract<ExpenseBlock, { type: 'bars' }> }) {
  const max = Math.max(...block.series.flatMap((series) => series.values), 0) || 1;
  return (
    <section className="expense-block">
      <BlockTitle title={block.title} />
      <div
        className="expense-bars"
        style={{ gridTemplateColumns: `repeat(${block.labels.length}, minmax(0, 1fr))` }}
      >
        {block.labels.map((label, index) => (
          <div key={`${label}-${index}`} className={`expense-bar-col${block.highlight === index ? ' is-on' : ''}`}>
            <div className="expense-bar-track">
              {block.series.map((series, seriesIndex) => {
                const value = series.values[index] ?? 0;
                const height = Math.max(value > 0 ? 6 : 0, (value / max) * 100);
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
            <span className="expense-bar-label">{label}</span>
          </div>
        ))}
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
            <tr key={index}>
              {block.columns.map((column, cell) => (
                <td key={column}>{row[cell] ?? ''}</td>
              ))}
            </tr>
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
            <li key={`${item.label}-${index}`}>
              <span className="expense-line-label">{item.label}</span>
              <span className="expense-line-meta">
                {item.date ? <span className="muted">{item.date}</span> : null}
                {status ? <span className={`expense-status is-${item.status}`}>{status}</span> : null}
                {item.amount ? <strong>{item.amount}</strong> : null}
              </span>
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
