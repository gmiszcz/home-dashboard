import { useState } from 'react';

import { Header } from './components/Header';
import { SectionGrid } from './components/SectionGrid';
import { useClock } from './hooks/useClock';
import { useDashboard } from './hooks/useDashboard';
import { useWakeLock } from './hooks/useWakeLock';

export default function App() {
  const now = useClock();
  useWakeLock(); // Utrzymuje ekran wybudzony w tle, jeśli przeglądarka na to pozwala
  const { sections, mode, staleMinutes, unauthorized } = useDashboard();

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
    <div className="shell">
      <Header
        now={now}
        mode={mode}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
      />
      <main>
        <SectionGrid
          sections={sections}
          now={now}
          staleMinutes={staleMinutes}
          unauthorized={unauthorized}
          mode={mode}
          viewMode={viewMode}
        />
      </main>
    </div>
  );
}
