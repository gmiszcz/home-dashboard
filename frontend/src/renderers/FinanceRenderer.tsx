import type { RendererProps } from '../types';
import { ExpensesRenderer } from './ExpensesRenderer';

export function FinanceRenderer(props: RendererProps) {
  return <ExpensesRenderer {...props} periodType="month" />;
}
