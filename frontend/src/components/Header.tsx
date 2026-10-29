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
  wakeLock,
}: {
  now: Date;
  mode: ConnectionMode;
  wakeLock: boolean;
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
        <Tag
          value={wakeLock ? 'ekran aktywny' : 'bez blokady uśpienia'}
          severity={wakeLock ? 'secondary' : 'contrast'}
          rounded
          icon={wakeLock ? 'pi pi-eye' : 'pi pi-eye-slash'}
        />
      </div>
    </header>
  );
}
