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
}: {
  mode: ConnectionMode;
  viewMode: 'simple' | 'full';
  onToggleViewMode: () => void;
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
            role="status"
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
            <i
              className={`pi ${viewMode === 'simple' ? 'pi-sparkles' : 'pi-th-large'}`}
              aria-hidden="true"
            />
            <span>{viewMode === 'simple' ? 'Widok prosty' : 'Pełny widok'}</span>
          </button>
        </div>
      </div>

      <div className="topbar-weather">
        <WeatherTimeline weather={weather} unavailable={unavailable} />
      </div>
    </header>
  );
}
