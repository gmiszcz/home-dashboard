import { Header } from './components/Header';
import { SectionGrid } from './components/SectionGrid';
import { useClock } from './hooks/useClock';
import { useDashboard } from './hooks/useDashboard';
import { useWakeLock } from './hooks/useWakeLock';

export default function App() {
  const now = useClock();
  const wakeLock = useWakeLock();
  const { sections, mode, staleMinutes, unauthorized } = useDashboard();

  return (
    <div className="shell">
      <Header now={now} mode={mode} wakeLock={wakeLock} />
      <main>
        <SectionGrid
          sections={sections}
          now={now}
          staleMinutes={staleMinutes}
          unauthorized={unauthorized}
          mode={mode}
        />
      </main>
    </div>
  );
}
