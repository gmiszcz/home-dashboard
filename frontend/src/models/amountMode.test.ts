import { describe, expect, it } from 'vitest';

import { formatMoney } from '../format';
import { amountModeKey, amountParts, nextAmountMode } from './amountMode';
import { formatShare } from './payslip';

describe('amount mode', () => {
  it('cycles zł + %, zł, then % and stores one key per tile', () => {
    expect(nextAmountMode('both')).toBe('amount');
    expect(nextAmountMode('amount')).toBe('percent');
    expect(nextAmountMode('percent')).toBe('both');
    expect(amountModeKey('payslip')).toBe('dashboard_amount_mode_payslip');
    expect(amountModeKey('prad')).toBe('dashboard_amount_mode_prad');
    expect(amountModeKey('payslip')).not.toBe(amountModeKey('prad'));
  });

  it('shows the amount with the share in parentheses, or one of the two', () => {
    const share = formatShare(286.13, 484.11);
    const money = formatMoney(286.13, 'PLN');
    expect(amountParts('both', 286.13, 484.11, 'PLN')).toEqual({ primary: money, secondary: ` (${share})` });
    expect(amountParts('amount', 286.13, 484.11, 'PLN')).toEqual({ primary: money, secondary: null });
    expect(amountParts('percent', 286.13, 484.11, 'PLN')).toEqual({ primary: share, secondary: null });
    expect(share).toBe('59,1%');
  });
});
