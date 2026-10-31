import { useState } from 'react';

import { Header } from './components/Header';
import { SectionGrid } from './components/SectionGrid';
import { useClock } from './hooks/useClock';
import { useDashboard } from './hooks/useDashboard';
import { useWakeLock } from './hooks/useWakeLock';

export default function App() {
  // Only the header shows seconds. The grid needs a coarser tick (relative times, "today" checks).
  const now = useClock(15_000);
  useWakeLock(); // Keeps the screen awake when the browser allows it
  const { sections, mode, staleMinutes, unauthorized, isItemAcked, ackItem } = useDashboard();

  const [viewMode, setViewMode] = useState<'simple' | 'full'>(() => {
    try {
      return (localStorage.getItem('dashboard_view_mode') as 'simple' | 'full') || 'simple';
    } catch {
      return 'simple';
    }
  });

  const handleToggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'simple' ? 'full' : 'simple';
      try {
        localStorage.setItem('dashboard_view_mode', next);
      } catch {
        // ignore
      }
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
          staleMinutes={staleMinutes}
          unauthorized={unauthorized}
          mode={mode}
          viewMode={viewMode}
          isItemAcked={isItemAcked}
          onAckItem={ackItem}
        />
      </main>
    </div>
  );
}
