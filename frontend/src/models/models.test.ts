import { describe, expect, it } from 'vitest';

import { daysUntil } from '../format';
import { boostedSectionOrder, daypart, resolveSectionOrder } from '../sections';
import type { SectionUpdate } from '../types';
import { formatWeekDiff, readExpenses } from './expenses';
import { budgetProgress, readFinance } from './finance';
import { familyCountdown } from './family';
import { deadlineCountdown } from './parcels';
import { historyFor } from './prices';
import { readSubscriptions } from './subscriptions';

const NOW = new Date('2026-10-30T12:00:00+01:00');
const MORNING = new Date('2026-10-30T08:15:00+01:00');
const EVENING = new Date('2026-10-30T18:05:00+01:00');

function update(section: string, extra: Record<string, unknown>, items: SectionUpdate['items'] = []): SectionUpdate {
  return {
    id: 1,
    received_at: '2026-10-30 11:00:00',
    schema_version: 1,
    section,
    generated_at: '2026-10-30T11:00:00+01:00',
    items,
    extra,
  };
}

describe('expenses', () => {
  it('falls back when the chart fields are missing', () => {
    const model = readExpenses(
      update('expenses_weekly', { total: 10, currency: 'PLN', week: '2026-W44' }, [
        { name: 'Zakupy', amount: 10, currency: 'PLN' },
      ]),
    );
    expect(model.chart).toBe(false);
    expect(model.diff).toBeNull();
  });

  it('reads the donut, days, previous week and the diff line', () => {
    const model = readExpenses(
      update(
        'expenses_weekly',
        {
          total: 372.4,
          currency: 'PLN',
          week_from: '2026-10-26',
          week_to: '2026-11-01',
          data_until: '2026-10-30',
          diff_vs_previous: 120,
          by_category: [{ category: 'spożywcze', amount: 186.4 }],
          by_day: [
            { date: '2026-10-28', label: 'Śr', amount: 80 },
            { date: '2026-10-26', label: 'Pn', amount: 40 },
          ],
          previous_week: {
            total: 252.4,
            by_category: [{ category: 'paliwo', amount: 50 }],
            items: [{ name: 'Orlen', amount: 50, category: 'paliwo', date: '2026-10-20' }],
          },
        },
        [{ name: 'Chleb', amount: 12, category: 'spożywcze', date: '2026-10-26' }],
      ),
    );
    expect(model.chart).toBe(true);
    expect(model.current.byDay.map((day) => day.label)).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']);
    expect(model.current.byDay[0].amount).toBe(40);
    expect(model.current.byDay[1].amount).toBe(0);
    expect(model.previous?.items).toHaveLength(1);
    expect(formatWeekDiff(model.diff ?? 0, 'PLN')).toContain('+');
    expect(formatWeekDiff(model.diff ?? 0, 'PLN')).toContain('vs poprzedni tydzień');
    expect(formatWeekDiff(-20, 'PLN').startsWith('−')).toBe(true);
  });
});

describe('finance', () => {
  it('shows a budget ratio and treats a null budget as no budget', () => {
    expect(budgetProgress(640, 4000)).toMatchObject({ hasBudget: true, over: false });
    expect(budgetProgress(5000, 4000).over).toBe(true);
    expect(budgetProgress(640, null)).toMatchObject({ hasBudget: false, percent: null, outgoing: 640 });
    const model = readFinance(
      update('finance', {
        outgoing: 100,
        budget: null,
        forecast_outgoing: 400,
        by_day: [{ date: '2026-10-30', out: 80, in: 20 }],
      }),
    );
    expect(model.progress.hasBudget).toBe(false);
    expect(model.forecast).toBe(400);
    expect(model.days[0]).toMatchObject({ label: '30', out: 80, in: 20 });
  });
});

describe('subscriptions', () => {
  it('uses next_30_days and marks charges within 3 days', () => {
    const model = readSubscriptions(
      update('subscriptions', {
        currency: 'PLN',
        next_30_days: [
          { date: '2026-11-01', name: 'Tygodnik', amount: 29 },
          { date: '2026-12-20', name: 'Za późno', amount: 5 },
          { date: '2026-11-12', name: 'Dysk', amount: 9 },
        ],
      }),
      NOW,
    );
    expect(model.charges.map((charge) => charge.name)).toEqual(['Tygodnik', 'Dysk']);
    expect(model.charges[0].soon).toBe(true);
    expect(model.charges[1].soon).toBe(false);
  });

  it('falls back to item next_charge', () => {
    const model = readSubscriptions(
      update('subscriptions', { currency: 'PLN' }, [
        { name: 'Muzyka', amount: 19.99, currency: 'PLN', next_charge: '2026-11-02T08:00:00+01:00' },
        { name: 'Rok', amount: 100, currency: 'PLN', next_charge: '2027-03-01T08:00:00+01:00' },
      ]),
      NOW,
    );
    expect(model.timeline).toBe(true);
    expect(model.charges.map((charge) => charge.name)).toEqual(['Muzyka']);
  });
});

describe('prices history', () => {
  it('keeps the last 30 days for the product and drops older points', () => {
    const points = historyFor(
      update('prices', {
        history: {
          'Kawa ziarnista': [
            { date: '2026-09-01', price: 55, store: 'A' },
            { date: '2026-10-02', price: 48, store: 'A' },
            { date: '2026-10-30', price: 42.9, store: 'B' },
          ],
        },
      }),
      { product: 'Kawa ziarnista', threshold: 45 },
      NOW,
    );
    expect(points.map((point) => point.date)).toEqual(['2026-10-02', '2026-10-30']);
  });
});

describe('parcels and family countdowns', () => {
  it('counts down to a deadline and reports a missed one', () => {
    expect(deadlineCountdown('2026-10-31T20:00:00+01:00', NOW)).toContain('dzień');
    expect(deadlineCountdown('2026-10-29T10:00:00+01:00', NOW)).toBe('termin minął');
    expect(deadlineCountdown('not-a-date', NOW)).toBeNull();
  });

  it('counts family events in days', () => {
    expect(daysUntil('2026-10-30', NOW)).toBe(0);
    expect(familyCountdown('2026-10-30', NOW)).toBe('dziś');
    expect(familyCountdown('2026-10-31', NOW)).toBe('jutro');
    expect(familyCountdown('2026-11-04', NOW)).toBe('za 5 dni');
    expect(familyCountdown('2026-10-29', NOW)).toBe('wczoraj');
  });
});

describe('time of day order', () => {
  const names = ['calendar', 'parcels', 'ai_daily', 'finance'];

  it('leads with calendar and ai_daily in the morning', () => {
    expect(daypart(MORNING)).toBe('morning');
    const order = resolveSectionOrder(names, null, MORNING, true);
    expect(order.slice(0, 2)).toEqual(['calendar', 'ai_daily']);
  });

  it('leads with parcels and calendar in the evening', () => {
    expect(daypart(EVENING)).toBe('evening');
    const order = resolveSectionOrder(names, null, EVENING, true);
    expect(order.slice(0, 2)).toEqual(['parcels', 'calendar']);
  });

  it('leaves the default order at midday and when the setting is off', () => {
    expect(daypart(NOW)).toBe('day');
    const midday = resolveSectionOrder(names, null, NOW, true);
    expect(midday[0]).toBe('calendar');
    expect(midday[1]).toBe('parcels');
    const off = boostedSectionOrder(['calendar', 'parcels', 'ai_daily'], MORNING, false);
    expect(off).toEqual(['calendar', 'parcels', 'ai_daily']);
  });

  it('does not override a manual drag order', () => {
    const manual = ['finance', 'parcels', 'calendar'];
    expect(resolveSectionOrder(names, manual, MORNING, true).slice(0, 3)).toEqual(manual);
  });
});
