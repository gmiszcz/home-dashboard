import { amountParts, type AmountMode } from '../models/amountMode';

const LABEL: Record<AmountMode, { full: string; short: string; title: string }> = {
  both: {
    full: 'zł + %',
    short: 'zł%',
    title: 'Kwota i procent. Kliknij, aby pokazać tylko złote',
  },
  amount: {
    full: 'zł',
    short: 'zł',
    title: 'Tylko złote. Kliknij, aby pokazać tylko procent',
  },
  percent: {
    full: '%',
    short: '%',
    title: 'Tylko procent. Kliknij, aby pokazać złote i procent',
  },
};

export function AmountModeToggle({ mode, onCycle }: { mode: AmountMode; onCycle: () => void }) {
  const label = LABEL[mode];
  return (
    <button
      type="button"
      className={`card-toggle-btn seg-btn${mode === 'both' ? '' : ' is-on'}`}
      title={label.title}
      aria-label={`${label.full}. ${label.title}`}
      onClick={(event) => {
        event.stopPropagation();
        onCycle();
      }}
    >
      <span className="seg-full">{label.full}</span>
      <span className="seg-short">{label.short}</span>
    </button>
  );
}

/** Legend / list readout. `both` is the amount with the share in parentheses. */
export function AmountReadout({
  mode,
  value,
  whole,
  currency,
}: {
  mode: AmountMode;
  value: number;
  whole: number;
  currency: string;
}) {
  const parts = amountParts(mode, value, whole, currency);
  return (
    <>
      <strong>{parts.primary}</strong>
      {parts.secondary ? <em className="legend-pct">{parts.secondary}</em> : null}
    </>
  );
}
