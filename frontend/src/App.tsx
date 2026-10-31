import { useState } from 'react';

import { Header } from './components/Header';
import { SectionGrid } from './components/SectionGrid';
import { useClock } from './hooks/useClock';
import { useDashboard } from './hooks/useDashboard';
import { useWakeLock } from './hooks/useWakeLock';
import { readEnum, write } from './storage';

const VIEW_MODE_KEY = 'dashboard_view_mode';
const VIEW_MODES = ['simple', 'full'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export default function App() {
  // Only the header shows seconds. The grid needs a coarser tick (relative times, "today" checks).
  const now = useClock(15_000);
  useWakeLock(); // Keeps the screen awake when the browser allows it
  const {
    sections,
    mode,
    unauthorized,
    isItemAcked,
    ackItem,
    unackItem,
    getItemMark,
    markItem,
  } = useDashboard();

  const [viewMode, setViewMode] = useState<ViewMode>(() => readEnum(VIEW_MODE_KEY, VIEW_MODES, 'simple'));

  const handleToggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'simple' ? 'full' : 'simple';
      write(VIEW_MODE_KEY, next);
      return next;
    });
  };

  return (
    <div className={`shell is-view-${viewMode}`}>
      <Header mode={mode} viewMode={viewMode} onToggleViewMode={handleToggleViewMode} />
      <main>
        <SectionGrid
          sections={sections}
          now={now}
          unauthorized={unauthorized}
          mode={mode}
          viewMode={viewMode}
          isItemAcked={isItemAcked}
          onAckItem={ackItem}
          onUnackItem={unackItem}
          getItemMark={getItemMark}
          onMarkItem={markItem}
        />
      </main>
    </div>
  );
}
