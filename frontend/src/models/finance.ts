import type { SectionUpdate } from '../types';
import { asNumber, asRecord, asString } from './parse';

export interface FinanceDay {
  date: string;
  label: string;
  out: number;
  in: number;
}

export interface BudgetProgress {
  outgoing: number | null;
  budget: number | null;
  /** True when extra.budget is a positive number and outgoing is known. */
  hasBudget: boolean;
  percent: number | null;
  over: boolean;
}

export interface FinanceModel {
  currency: string;
  balance: number | null;
  incoming: number | null;
  outgoing: number | null;
  forecast: number | null;
  progress: BudgetProgress;
  days: FinanceDay[];
}

function readDays(value: unknown): FinanceDay[] {
  if (!Array.isArray(value)) return [];
  const days: FinanceDay[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const date = asString(row.date);
    if (!date) continue;
    const day = date.slice(8, 10).replace(/^0/, '') || date;
    days.push({
      date,
      label: day,
      out: asNumber(row.out) ?? 0,
      in: asNumber(row.in) ?? 0,
    });
  }
  return days;
}

export function budgetProgress(outgoing: number | null, budget: number | null): BudgetProgress {
  if (outgoing === null || budget === null || budget <= 0) {
    return { outgoing, budget, hasBudget: false, percent: null, over: false };
  }
  const ratio = outgoing / budget;
  return {
    outgoing,
    budget,
    hasBudget: true,
    percent: Math.max(0, Math.min(100, ratio * 100)),
    over: ratio > 1,
  };
}

export function readFinance(update: SectionUpdate): FinanceModel {
  const extra = update.extra ?? {};
  const budget = extra.budget === null || extra.budget === undefined ? null : asNumber(extra.budget);
  const outgoing = asNumber(extra.outgoing);
  return {
    currency: asString(extra.currency) ?? 'PLN',
    balance: asNumber(extra.balance),
    incoming: asNumber(extra.incoming),
    outgoing,
    forecast: asNumber(extra.forecast_outgoing),
    progress: budgetProgress(outgoing, budget),
    days: readDays(extra.by_day),
  };
}
