import type { RendererProps } from '../types';
import { MoneyRenderer } from './MoneyRenderer';

/**
 * The finance tile is a plain balance / cash-flow summary (incoming, outgoing,
 * balance). The rich monthly spending breakdown lives in the separate
 * "expenses_monthly" section, so finance stays a simple money tile.
 */
export function FinanceRenderer(props: RendererProps) {
  return <MoneyRenderer {...props} />;
}
