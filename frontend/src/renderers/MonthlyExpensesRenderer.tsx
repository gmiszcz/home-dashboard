import type { RendererProps } from '../types';
import { ExpensesRenderer } from './ExpensesRenderer';

/**
 * The monthly expenses tile. It reuses the full weekly expenses renderer
 * (donut by category, day bars, receipt drill-down, legend with amount + %,
 * current/previous period toggle) but over a calendar month.
 */
export function MonthlyExpensesRenderer(props: RendererProps) {
  return <ExpensesRenderer {...props} periodType="month" />;
}
