import { formatMoney } from '../format';
import { formatShare } from './payslip';

/** Header cycle: both (amount with the share in parentheses), amount only, percent only. */
export const AMOUNT_MODES = ['both', 'amount', 'percent'] as const;

export type AmountMode = (typeof AMOUNT_MODES)[number];

export function amountModeKey(section: string): string {
  return `dashboard_amount_mode_${section}`;
}

export function nextAmountMode(mode: AmountMode): AmountMode {
  if (mode === 'both') return 'amount';
  if (mode === 'amount') return 'percent';
  return 'both';
}

/** Primary text plus the parenthetical share. The share is omitted for a single-unit mode. */
export function amountParts(
  mode: AmountMode,
  value: number,
  whole: number,
  currency: string,
): { primary: string; secondary: string | null } {
  const money = formatMoney(value, currency);
  const share = formatShare(value, whole);
  if (mode === 'percent') return { primary: share, secondary: null };
  if (mode === 'amount') return { primary: money, secondary: null };
  return { primary: money, secondary: ` (${share})` };
}
