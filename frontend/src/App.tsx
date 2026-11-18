import { useEffect, useRef, useState } from 'react';

import { Header } from './components/Header';
import { SectionGrid } from './components/SectionGrid';
import { useClock } from './hooks/useClock';
import { useDashboard } from './hooks/useDashboard';
import { useWakeLock } from './hooks/useWakeLock';
import { ISOLATE_HISTORY, ISOLATE_KEY, hrefWithTile, resolveIsolatedTile, tileParam } from './isolate';
import { read, readBool, readEnum, remove, write } from './storage';
import { SHOW_HIDDEN_KEY } from './visibility';

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
    isItemStarred,
    starItem,
    unstarItem,
    getSectionFavorites,
    getSectionExclusions,
    excludeOffer,
    restoreOffer,
    getSectionHidden,
    hideOffer,
    restoreHiddenOffer,
    hiddenSections,
    seenMap,
    acknowledgeSeen,
  } = useDashboard();

  const [viewMode, setViewMode] = useState<ViewMode>(() => readEnum(VIEW_MODE_KEY, VIEW_MODES, 'simple'));
  const [showHidden, setShowHidden] = useState(() => readBool(SHOW_HIDDEN_KEY, false));
  const [isolated, setIsolated] = useState<string | null>(() => tileParam(window.location.search) ?? read(ISOLATE_KEY));
  const isolateScroll = useRef<number | null>(null);
  // A live socket sets the mode before the first section list arrives. An empty list then is not final.
  const sectionsReady = sections.length > 0 || mode === 'offline' || mode === 'polling';

  useEffect(() => {
    const known = sectionsReady ? sections.map((update) => update.section) : null;
    const next = resolveIsolatedTile(isolated, known);
    if (next !== isolated) {
      setIsolated(next);
      if (!next) remove(ISOLATE_KEY);
      const current = tileParam(window.location.search);
      if (current !== next) {
        window.history.replaceState(window.history.state, '', hrefWithTile(window.location.href, next));
      }
      return;
    }
    if (!next) return;
    write(ISOLATE_KEY, next);
    if (tileParam(window.location.search) !== next) {
      window.history.replaceState(window.history.state, '', hrefWithTile(window.location.href, next));
    }
  }, [isolated, sections, sectionsReady]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const restore = (top: number) => {
      const apply = () => window.scrollTo(0, top);
      requestAnimationFrame(apply);
      window.setTimeout(apply, 0);
    };
    const onPop = () => {
      const next = tileParam(window.location.search);
      setIsolated(next);
      if (next) write(ISOLATE_KEY, next);
      else {
        remove(ISOLATE_KEY);
        const top = isolateScroll.current;
        isolateScroll.current = null;
        if (top != null) restore(top);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.history.scrollRestoration = previous;
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const handleToggleIsolate = (section: string) => {
    if (isolated === section) {
      if (window.history.state && (window.history.state as { kind?: string }).kind === ISOLATE_HISTORY) {
        window.history.back();
        return;
      }
      setIsolated(null);
      remove(ISOLATE_KEY);
      window.history.replaceState(window.history.state, '', hrefWithTile(window.location.href, null));
      const top = isolateScroll.current;
      isolateScroll.current = null;
      if (top != null) {
        const apply = () => window.scrollTo(0, top);
        requestAnimationFrame(apply);
        window.setTimeout(apply, 0);
      }
      return;
    }
    isolateScroll.current = window.scrollY;
    setIsolated(section);
    write(ISOLATE_KEY, section);
    window.history.pushState({ kind: ISOLATE_HISTORY, section }, '', hrefWithTile(window.location.href, section));
  };

  const handleShowHidden = (active: boolean) => {
    setShowHidden(active);
    write(SHOW_HIDDEN_KEY, String(active));
  };

  const handleToggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'simple' ? 'full' : 'simple';
      write(VIEW_MODE_KEY, next);
      return next;
    });
  };

  return (
    <div className={`shell is-view-${viewMode}${isolated ? ' is-isolated' : ''}`}>
      <Header
        mode={mode}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        showHidden={showHidden}
        onToggleShowHidden={handleShowHidden}
      />
      <main>
        <SectionGrid
          sections={sections}
          now={now}
          unauthorized={unauthorized}
          mode={mode}
          viewMode={viewMode}
          showHidden={showHidden}
          isItemAcked={isItemAcked}
          onAckItem={ackItem}
          onUnackItem={unackItem}
          getItemMark={getItemMark}
          onMarkItem={markItem}
          isItemStarred={isItemStarred}
          onStarItem={starItem}
          onUnstarItem={unstarItem}
          getSectionFavorites={getSectionFavorites}
          getSectionExclusions={getSectionExclusions}
          onExcludeOffer={excludeOffer}
          onRestoreOffer={restoreOffer}
          getSectionHidden={getSectionHidden}
          onHideOffer={hideOffer}
          onRestoreHiddenOffer={restoreHiddenOffer}
          hiddenSections={hiddenSections}
          seenMap={seenMap}
          onAcknowledgeSeen={acknowledgeSeen}
          isolated={isolated}
          onToggleIsolate={handleToggleIsolate}
        />
      </main>
    </div>
  );
}
