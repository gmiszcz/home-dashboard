import { useState } from 'react';

import { AMOUNT_MODES, amountModeKey, nextAmountMode, type AmountMode } from '../models/amountMode';
import { readEnum, write } from '../storage';

/** Per-tile zł / % choice, stored like the other dashboard preferences. */
export function useAmountMode(section: string): [AmountMode, () => void] {
  const [mode, setMode] = useState<AmountMode>(() => readEnum(amountModeKey(section), AMOUNT_MODES, 'both'));
  const cycle = () => {
    setMode((current) => {
      const next = nextAmountMode(current);
      write(amountModeKey(section), next);
      return next;
    });
  };
  return [mode, cycle];
}
