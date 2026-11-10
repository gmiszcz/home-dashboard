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

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="brand">
          <p className="eyebrow">
            <i className="pi pi-home" aria-hidden="true" /> Pulpit domowy
          </p>
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
            className={`view-mode-pill ${viewMode === 'simple' ? 'is-simple' : 'is-full'}`}
            onClick={onToggleViewMode}
            title={
              viewMode === 'simple'
                ? 'Przełącz na pełny widok wszystkich kafelków'
                : 'Przełącz na widok prosty (tylko to, co ważne dziś)'
            }
          >
            <span>{viewMode === 'simple' ? 'Prosty' : 'Pełny'}</span>
          </button>
          <button
            type="button"
            className={`view-mode-pill header-eye${showHidden ? ' is-on' : ''}`}
            aria-pressed={showHidden}
            aria-label={showHidden ? 'Ukryj ukryte kafle' : 'Pokaż ukryte kafle'}
            title={showHidden ? 'Ukryj ukryte kafle' : 'Pokaż ukryte kafle'}
            onClick={() => onToggleShowHidden?.(!showHidden)}
          >
            <i className={`pi ${showHidden ? 'pi-eye' : 'pi-eye-slash'}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="topbar-weather">
        <WeatherTimeline weather={weather} unavailable={unavailable} />
      </div>
    </header>
  );
}
