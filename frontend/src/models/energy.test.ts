import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { SectionUpdate } from '../types';
import { energyPriceOption, energyPriceScale, energyTrendTooltip, formatBarTooltip, isHorizontalBar, payslipBarOption } from './charts';
import {
  isUsageInvoice,
  monthSpans,
  pricePerKwh,
  readEnergy,
  splitProportional,
  sumUsage,
} from './energy';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function update(overrides: Partial<SectionUpdate>): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-11-09T12:00:00+01:00',
    schema_version: 2,
    section: 'prad',
    generated_at: '2026-11-09T12:00:00+01:00',
    items: [],
    ...overrides,
  };
}

describe('electricity invoices', () => {
  const sample = JSON.parse(readFileSync(join(ROOT, 'samples/prad.json'), 'utf8')) as {
    data: { invoices: Record<string, unknown>[] };
  };
  const model = readEnergy(update({ data: sample.data, items: [{ title: 'Faktura' }] }));

  it('keeps corrections and notes on the list and out of usage', () => {
    expect(model.structured).toBe(true);
    expect(model.invoices).toHaveLength(8);
    expect(model.usage.map((invoice) => invoice.number)).toEqual([
      'E/GM2/GN088194/0001/26',
      'E/GM2/GN088194/0002/26',
      'E/GM2/GN088194/0004/26',
      'E/GM2/GN088194/0005/26',
      'E/GM2/GN088194/0006/26',
      'E/GM2/GN088194/0007/26',
    ]);
    const excluded = model.invoices.filter((invoice) => !isUsageInvoice(invoice));
    expect(excluded.map((invoice) => invoice.kind).sort()).toEqual(['correction', 'note']);
    expect(excluded.reduce((sum, invoice) => sum + (invoice.total ?? 0), 0)).toBe(0);
    expect(sumUsage(model.invoices).kwh).toBe(2444);
    expect(sumUsage(model.invoices).total).toBe(3019.69);
  });

  it('splits a bi-monthly invoice across calendar days and sums back to the bill', () => {
    expect(monthSpans('2025-11-27', '2026-01-28')).toEqual([
      { key: '2025-11', days: 4 },
      { key: '2025-12', days: 31 },
      { key: '2026-01', days: 28 },
    ]);
    expect(monthSpans('2026-01-29', '2026-03-19')).toEqual([
      { key: '2026-01', days: 3 },
      { key: '2026-02', days: 28 },
      { key: '2026-03', days: 19 },
    ]);
    const first = model.usage[0];
    const parts = splitProportional(first.total ?? 0, [4, 31, 28]);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(first.total ?? 0, 2);
    const january = model.months.find((month) => month.key === '2026-01');
    expect(january?.days).toBe(31);
    const kwh = model.months.reduce((sum, month) => sum + month.kwh, 0);
    const total = model.months.reduce((sum, month) => sum + month.total, 0);
    expect(kwh).toBeCloseTo(2444, 2);
    expect(total).toBeCloseTo(3019.69, 2);
    expect(model.months.some((month) => month.key === '2023-01')).toBe(false);
  });

  it('prices each invoice as gross total per kWh and falls back without structured data', () => {
    expect(pricePerKwh(model.usage[0])).toBe(1.21);
    expect(pricePerKwh(model.usage[model.usage.length - 1])).toBe(1.46);
    expect(model.prices.map((point) => point.price)).toEqual([1.21, 1.2, 1.2, 1.22, 1.23, 1.46]);
    const scale = energyPriceScale(model.prices.map((point) => point.price));
    expect(scale.min).toBeLessThan(1.2);
    expect(scale.max).toBeGreaterThan(1.46);
    expect(scale.max - scale.min).toBeLessThan(0.8);
    const priced = energyPriceOption(model.prices);
    expect(priced.yAxis.min).toBe(scale.min);
    expect(priced.yAxis.max).toBe(scale.max);
    const generic = readEnergy(update({ items: [{ title: 'Faktura 0007' }] }));
    expect(generic.structured).toBe(false);
    expect(generic.invoices).toEqual([]);
  });
});

describe('shared bar chart', () => {
  it('keeps vertical columns unless orientation asks for horizontal bars', () => {
    expect(isHorizontalBar('vertical')).toBe(false);
    expect(isHorizontalBar(false)).toBe(false);
    expect(isHorizontalBar('horizontal')).toBe(true);
    expect(isHorizontalBar(true)).toBe(true);
    const vertical = payslipBarOption(
      [{ label: 'sty 26', amount: 10, color: '#e2a53a' }],
      'PLN',
      false,
      10,
      'vertical',
      'szacunek',
    );
    const horizontal = payslipBarOption(
      [{ label: 'sty 26', amount: 10, color: '#e2a53a' }],
      'PLN',
      false,
      10,
      'horizontal',
    );
    expect(vertical.xAxis.type).toBe('category');
    expect(vertical.yAxis.type).toBe('value');
    expect(horizontal.xAxis.type).toBe('value');
    expect(horizontal.yAxis.type).toBe('category');
    expect(formatBarTooltip(12.5, false, 'PLN', 'szacunek')).toContain('szacunek');
    expect(energyTrendTooltip([{ seriesName: 'kWh', axisValueLabel: 'sty 26', value: 40 }])).toContain('szacunek');
  });
});
