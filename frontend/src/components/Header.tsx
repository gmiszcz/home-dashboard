import { formatClock } from '../format';
import { useClock } from '../hooks/useClock';
import { useWeather } from '../hooks/useWeather';
import type { ConnectionMode } from '../types';
import { WeatherTimeline } from './WeatherTimeline';

const MODE_INFO: Record<ConnectionMode, { title: string; colorClass: string }> = {
  live: { title: 'Połączono na żywo (WebSocket)', colorClass: 'is-live' },
  polling: { title: 'Połączono (odpytywanie co 20 s)', colorClass: 'is-polling' },
  connecting: { title: 'Nawiązywanie połączenia…', colorClass: 'is-connecting' },
  offline: { title: 'Brak połączenia z serwerem', colorClass: 'is-offline' },
};

function RyukMark() {
  return (
    <svg className="ryuk-logo" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ryuk-roof" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9b14a" />
          <stop offset="1" stopColor="#c0612b" />
        </linearGradient>
      </defs>
      <path
        d="M8 30 L32 10 L56 30"
        stroke="url(#ryuk-roof)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 28 V52 H48 V28" stroke="#d8dcdc" strokeWidth="4" fill="none" strokeLinejoin="round" />
      <path d="M24 40 Q32 33 40 40 Q32 47 24 40 Z" fill="#e9b14a" />
      <circle cx="32" cy="40" r="2.6" fill="#0e1418" />
    </svg>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg className="header-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="header-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function Header({
  mode,
  viewMode,
  onToggleViewMode,
  showHidden = false,
  onToggleShowHidden,
}: {
  mode: ConnectionMode;
  viewMode: 'simple' | 'full';
  onToggleViewMode: () => void;
  showHidden?: boolean;
  onToggleShowHidden?: (active: boolean) => void;
}) {
  const now = useClock();
  const clock = formatClock(now);
  const info = MODE_INFO[mode];
  const { weather, unavailable } = useWeather();
  const viewLabel = viewMode === 'simple' ? 'Prosty' : 'Pełny';

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="brand">
          <RyukMark />
          <h1>Ryuk</h1>
        </div>

        <div className="clock" aria-live="off">
          <p className="date">{clock.date}</p>
          <p className="time">{clock.time}</p>
        </div>

        <div className="status-row">
          <span
            className={`status-led ${info.colorClass}`}
            title={info.title}
            aria-label={info.title}
            role="img"
          />
          <button
            type="button"
            className="header-icon-btn"
            aria-pressed={showHidden}
            aria-label={showHidden ? 'Ukryj ukryte kafle' : 'Pokaż ukryte kafle'}
            title={showHidden ? 'Ukryj ukryte kafle' : 'Pokaż ukryte kafle'}
            onClick={() => onToggleShowHidden?.(!showHidden)}
          >
            <EyeIcon crossed={!showHidden} />
          </button>
          <button
            type="button"
            className="header-icon-btn"
            aria-label={viewLabel}
            title={viewLabel}
            onClick={onToggleViewMode}
          >
            <GridIcon />
          </button>
        </div>
      </div>

      <div className="topbar-weather">
        <WeatherTimeline weather={weather} unavailable={unavailable} />
      </div>
    </header>
  );
}
