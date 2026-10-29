import { Tag } from 'primereact/tag';

import { formatClock } from '../format';
import type { ConnectionMode } from '../types';

const MODE: Record<ConnectionMode, { label: string; severity: 'success' | 'info' | 'warning' | 'danger' }> = {
  connecting: { label: 'łączenie', severity: 'info' },
  live: { label: 'na żywo', severity: 'success' },
  polling: { label: 'odpytywanie', severity: 'warning' },
  offline: { label: 'brak połączenia', severity: 'danger' },
};

export function Header({
  now,
  mode,
  viewMode,
  onToggleViewMode,
}: {
  now: Date;
  mode: ConnectionMode;
  viewMode: 'simple' | 'full';
  onToggleViewMode: () => void;
}) {
  const clock = formatClock(now);
  const connection = MODE[mode];
  return (
    <header className="topbar">
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
        <Tag value={connection.label} severity={connection.severity} rounded icon="pi pi-circle-fill" />
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
    </header>
  );
}
