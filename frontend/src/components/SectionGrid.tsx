import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Message } from 'primereact/message';

import {
  CardSpan,
  cardSpanClass,
  contentCount,
  contentFingerprint,
  getCardSpan,
  getSimpleItems,
  hasDisplayableContent,
  isSimpleSection,
  nextCardSpan,
  parseStoredWidths,
  PROMOTIONS_SKIPPED_FILTER,
  resolveSectionOrder,
  SECTION_ORDER,
  STORAGE_WIDTH_KEY,
} from '../sections';
import type { ConnectionMode, SectionUpdate } from '../types';
import { SectionCard } from './SectionCard';

const STORAGE_ORDER_KEY = 'dashboard_custom_order';
const STORAGE_SEEN_KEY = 'dashboard_seen_content';
const TIME_ORDER_KEY = 'dashboard_time_order';

function loadTimeOrderEnabled(): boolean {
  try {
    return localStorage.getItem(TIME_ORDER_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Acknowledged fingerprint per section. null means first run: no baseline yet. */
function loadSeen(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(STORAGE_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function saveSeen(seen: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_SEEN_KEY, JSON.stringify(seen));
  } catch {
    // ignore
  }
}

function loadStoredOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function sortSectionsWithMemory(
  list: SectionUpdate[],
  order: string[]
): SectionUpdate[] {
  const orderMap = new Map<string, number>();
  order.forEach((key, idx) => orderMap.set(key, idx));

  const getRank = (key: string) => {
    const r = orderMap.get(key);
    return r !== undefined ? r : 9999;
  };

  // The user-defined order takes absolute priority
  return [...list].sort((a, b) => getRank(a.section) - getRank(b.section));
}

export function SectionGrid({
  sections,
  now,
  unauthorized,
  mode,
  viewMode = 'simple',
  isItemAcked,
  onAckItem,
  onUnackItem,
  getItemMark,
  onMarkItem,
}: {
  sections: SectionUpdate[];
  now: Date;
  unauthorized: boolean;
  mode: ConnectionMode;
  viewMode?: 'simple' | 'full';
  isItemAcked?: (section: string, itemId: string) => boolean;
  onAckItem?: (section: string, itemId: string) => void;
  onUnackItem?: (section: string, itemId: string) => void;
  getItemMark?: (section: string, itemId: string) => string | undefined;
  onMarkItem?: (section: string, itemId: string, kind: string) => void;
}) {
  const [manualOrder, setManualOrder] = useState<string[] | null>(() => {
    const saved = loadStoredOrder();
    return saved && saved.length > 0 ? saved : null;
  });
  const [timeOrderEnabled, setTimeOrderEnabled] = useState(loadTimeOrderEnabled);
  const [widthMap, setWidthMap] = useState<Record<string, CardSpan>>(() => {
    try {
      return parseStoredWidths(localStorage.getItem(STORAGE_WIDTH_KEY));
    } catch {
      return {};
    }
  });
  // Promotions "Pominięte" checkbox, stored per device. It lives here because it decides if the tile is shown.
  const [showSkipped, setShowSkipped] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(PROMOTIONS_SKIPPED_FILTER.storageKey);
      return stored !== null ? stored === 'true' : PROMOTIONS_SKIPPED_FILTER.defaultActive;
    } catch {
      return PROMOTIONS_SKIPPED_FILTER.defaultActive;
    }
  });
  const [seen, setSeen] = useState<Record<string, string> | null>(loadSeen);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Record<string, { left: number; top: number }>>({});
  const dragItem = useRef<number | null>(null);
  const dragCardId = useRef<string | null>(null);
  const lastSwapTime = useRef<number>(0);
  const touchActiveIdx = useRef<number | null>(null);

  // A saved drag order stays put. New sections are appended without replacing it.
  useEffect(() => {
    if (!manualOrder) return;
    const missing = sections.map((section) => section.section).filter((key) => !manualOrder.includes(key));
    if (missing.length === 0) return;
    const next = [...manualOrder, ...missing];
    setManualOrder(next);
    try {
      localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [sections, manualOrder]);

  const displayOrder = useMemo(
    () =>
      resolveSectionOrder(
        sections.map((section) => section.section),
        manualOrder,
        now,
        timeOrderEnabled,
      ),
    [sections, manualOrder, now, timeOrderEnabled],
  );

  // First run on this device: everything already on screen counts as acknowledged
  useEffect(() => {
    if (sections.length === 0) return;
    setSeen((prev) => {
      if (prev !== null) return prev;
      const baseline = Object.fromEntries(sections.map((s) => [s.section, contentFingerprint(s)]));
      saveSeen(baseline);
      return baseline;
    });
  }, [sections]);

  // Sections whose content changed since the user last acknowledged them. Empty updates never count.
  const freshSections = useMemo(() => {
    const fresh = new Set<string>();
    if (seen === null) return fresh;
    for (const update of sections) {
      if (contentCount(update) === 0) continue;
      if (seen[update.section] !== contentFingerprint(update)) fresh.add(update.section);
    }
    return fresh;
  }, [sections, seen]);

  // Tiles without content are hidden in every view. Order and indices are computed from the rest only.
  const filledSections = useMemo(
    () => sections.filter((update) => hasDisplayableContent(update, { getItemMark, showSkipped })),
    [sections, getItemMark, showSkipped],
  );

  // Compute sections to display: viewMode filtering + userOrder memory
  const displaySections = useMemo(() => {
    let activeList: SectionUpdate[];
    if (viewMode === 'full') {
      // Full view: fresh tiles first (newest on top), the rest keeps the user's order
      const ordered = sortSectionsWithMemory(filledSections, displayOrder);
      const fresh = ordered
        .filter((s) => freshSections.has(s.section))
        .sort((a, b) => Date.parse(b.generated_at) - Date.parse(a.generated_at));
      const rest = ordered.filter((s) => !freshSections.has(s.section));
      return [...fresh, ...rest];
    } else {
      // Simple View: only sections that matter today, with filtered simple items, uncollapsed
      activeList = filledSections
        .filter((sec) => isSimpleSection(sec, now, isItemAcked))
        .map((sec) => ({
          ...sec,
          display: {
            ...(sec.display ?? {}),
            collapsed: false,
            max_visible: sec.display?.max_visible ?? 3,
          },
          items: getSimpleItems(sec, now, isItemAcked),
        }));
    }

    return sortSectionsWithMemory(activeList, displayOrder);
  }, [filledSections, displayOrder, viewMode, now, freshSections, isItemAcked]);

  // Layout positions (offsetLeft/Top): unaffected by scrolling and by a running FLIP transform
  const measurePositions = useCallback((nodes: NodeListOf<HTMLElement>) => {
    const pos: Record<string, { left: number; top: number }> = {};
    nodes.forEach((n) => {
      const id = n.dataset.cardId;
      if (id) pos[id] = { left: n.offsetLeft, top: n.offsetTop };
    });
    return pos;
  }, []);

  const capturePositions = useCallback(() => {
    if (!gridRef.current) return;
    const nodes = gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]');
    nodes.forEach((n) => {
      n.style.transition = 'none';
      n.style.transform = '';
    });
    positionsRef.current = measurePositions(nodes);
  }, [measurePositions]);

  // FLIP animation whenever the order changes: drag, "Ogarnięte" or new data from the server
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const old = positionsRef.current;
    const nodes = gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]');
    const current = measurePositions(nodes);
    // Positions after this render are the starting point for the next change
    positionsRef.current = current;
    if (!Object.keys(old).length) return;
    const dragId = dragCardId.current;

    nodes.forEach((n) => {
      const id = n.dataset.cardId;
      if (!id || (dragId != null && String(dragId) === id)) return;
      const prev = old[id];
      const curr = current[id];
      if (!prev || !curr) return;
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

      // INVERT: snap to old position
      n.style.transition = 'none';
      n.style.transform = `translate(${dx}px, ${dy}px)`;
      void n.offsetHeight; // force reflow

      // PLAY: animate to new position
      n.style.transition = 'transform var(--anim-move) var(--anim-move-ease)';
      n.style.transform = '';

      const onEnd = () => {
        n.style.transition = '';
        n.style.transform = '';
        n.removeEventListener('transitionend', onEnd);
      };
      n.addEventListener('transitionend', onEnd);
    });
  }, [displaySections, measurePositions]);

  const handleSwap = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
      const nowTs = Date.now();
      if (nowTs - lastSwapTime.current < 160) return;
      lastSwapTime.current = nowTs;

      const fromCard = displaySections[fromIdx];
      const toCard = displaySections[toIdx];
      if (!fromCard || !toCard) return;

      capturePositions();
      setManualOrder((prevOrder) => {
        const full = Array.from(
          new Set([...(prevOrder ?? displayOrder), ...SECTION_ORDER, ...sections.map((s) => s.section)]),
        );
        const fromPos = full.indexOf(fromCard.section);
        const toPos = full.indexOf(toCard.section);
        if (fromPos === -1 || toPos === -1 || fromPos === toPos) return prevOrder;

        const next = [...full];
        const [moved] = next.splice(fromPos, 1);
        next.splice(toPos, 0, moved);

        try {
          localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [capturePositions, displayOrder, displaySections, sections]
  );

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragItem.current = idx;
    dragCardId.current = displaySections[idx]?.section ?? null;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    if (displaySections[idx]) {
      e.dataTransfer.setData('text/plain', displaySections[idx].section);
    }
  };

  const handleDragEnter = (idx: number) => {
    if (dragItem.current === null || dragItem.current === idx) return;
    setDragOverIdx(idx);
    handleSwap(dragItem.current, idx);
    dragItem.current = idx;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragCardId.current = null;
    setDraggingIdx(null);
    setDragOverIdx(null);
    if (gridRef.current) {
      gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]').forEach((n) => {
        n.style.transition = '';
        n.style.transform = '';
      });
    }
  };

  // Touch handlers for iPad Safari
  const handleTouchStart = (idx: number) => {
    touchActiveIdx.current = idx;
    dragItem.current = idx;
    dragCardId.current = displaySections[idx]?.section ?? null;
    setDraggingIdx(idx);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchActiveIdx.current === null) return;
    const touch = e.touches[0];
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetEl) return;
    const cardEl = targetEl.closest<HTMLElement>('[data-card-id]');
    if (!cardEl) return;
    const targetSection = cardEl.dataset.cardId;
    if (!targetSection) return;
    const targetIdx = displaySections.findIndex((s) => s.section === targetSection);
    if (targetIdx !== -1 && targetIdx !== touchActiveIdx.current) {
      handleSwap(touchActiveIdx.current, targetIdx);
      touchActiveIdx.current = targetIdx;
      dragItem.current = targetIdx;
      setDragOverIdx(targetIdx);
    }
  };

  const handleTouchEnd = () => {
    touchActiveIdx.current = null;
    handleDragEnd();
  };

  // Cycle card width: 1 col (1/3) -> 2 cols (2/3) -> 3 cols (full) -> 1 col
  const handleToggleWidth = (section: string) => {
    if (gridRef.current) {
      gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]').forEach((n) => {
        n.style.transition = '';
        n.style.transform = '';
      });
    }
    positionsRef.current = {};
    setWidthMap((prev) => {
      const current = getCardSpan(section, prev);
      const nextSpan = nextCardSpan(current);
      const next = { ...prev, [section]: nextSpan };
      try {
        localStorage.setItem(STORAGE_WIDTH_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };

  // "Ogarnięte": remember the current content, the tile animates back to its own place
  const handleAcknowledge = (section: string) => {
    const update = sections.find((s) => s.section === section);
    if (!update) return;
    capturePositions();
    setSeen((prev) => {
      const next = { ...(prev ?? {}), [section]: contentFingerprint(update) };
      saveSeen(next);
      return next;
    });
  };

  const handleToggleShowSkipped = (active: boolean) => {
    capturePositions();
    setShowSkipped(active);
    try {
      localStorage.setItem(PROMOTIONS_SKIPPED_FILTER.storageKey, String(active));
    } catch {
      // ignore
    }
  };

  const handleResetLayout = () => {
    localStorage.removeItem(STORAGE_ORDER_KEY);
    localStorage.removeItem(STORAGE_WIDTH_KEY);
    setWidthMap({});
    setManualOrder(null);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };

  const handleToggleTimeOrder = () => {
    setTimeOrderEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TIME_ORDER_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const timeOrderButton = (
    <button
      type="button"
      className={`reset-layout-btn${timeOrderEnabled ? ' is-on' : ''}`}
      onClick={handleToggleTimeOrder}
      aria-pressed={timeOrderEnabled}
      title="Rano kalendarz i AI na górze, wieczorem przesyłki i kalendarz na jutro. Ręczna kolejność ma pierwszeństwo."
    >
      <i className="pi pi-clock" /> Układ dnia: {timeOrderEnabled ? 'włączony' : 'wyłączony'}
    </button>
  );

  if (unauthorized) {
    return (
      <Message
        severity="warn"
        className="banner"
        text="Odczyt jest chroniony tokenem. Otwórz pulpit z parametrem ?token= w adresie — zostanie zapisany na tym iPadzie."
      />
    );
  }
  if (sections.length === 0 && mode === 'connecting') {
    return <Message severity="info" className="banner" text="Łączenie z pulpitem…" />;
  }
  if (sections.length === 0 && mode === 'offline') {
    return (
      <Message
        severity="error"
        className="banner"
        text="Brak połączenia z serwerem. Pulpit spróbuje ponownie."
      />
    );
  }
  if (sections.length === 0) {
    return (
      <Message
        severity="info"
        className="banner"
        text="Brak podsumowań. Ryuk jeszcze nic nie wysłał na ten pulpit."
      />
    );
  }

  if (displaySections.length === 0 && viewMode === 'simple') {
    return (
      <div className="empty-simple-view">
        <Message
          severity="success"
          className="banner"
          text="Wszystko czyste! Brak pilnych zadań, terminów ani paczek na dziś."
        />
        <div className="grid-footer">
          <p className="muted" style={{ margin: '0.5rem 0' }}>
            Przełącz u góry na <strong>Pełny widok</strong>, aby zobaczyć wszystkie sekcje.
          </p>
          {timeOrderButton}
        </div>
      </div>
    );
  }

  if (displaySections.length === 0) {
    return (
      <Message
        severity="info"
        className="banner"
        text="Wszystkie kafle są teraz puste, więc nic nie pokazuję."
      />
    );
  }

  return (
    <>
      <div className="board" ref={gridRef} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {displaySections.map((update, index) => {
          const isDragging = draggingIdx === index;
          const isDragOver = dragOverIdx === index;
          const cardSpan = getCardSpan(update.section, widthMap);
          const spanClass = cardSpanClass(cardSpan);
          return (
            <div
              key={update.section}
              data-card-id={update.section}
              className={`card-wrapper${spanClass}${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SectionCard
                update={update}
                now={now}
                cardSpan={cardSpan}
                isFresh={viewMode === 'full' && freshSections.has(update.section)}
                onAcknowledge={() => handleAcknowledge(update.section)}
                onToggleWidth={() => handleToggleWidth(update.section)}
                isItemAcked={isItemAcked}
                onAckItem={onAckItem}
                onUnackItem={onUnackItem}
                getItemMark={getItemMark}
                onMarkItem={onMarkItem}
                showSkipped={showSkipped}
                onToggleShowSkipped={handleToggleShowSkipped}
                dragHandleProps={{
                  onTouchStart: () => handleTouchStart(index),
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="grid-footer">
        {timeOrderButton}
        {manualOrder && timeOrderEnabled ? (
          <span className="footer-mode-hint">Ręczna kolejność zostaje</span>
        ) : null}
        {viewMode === 'simple' ? (
          <span className="footer-mode-hint">
            <i className="pi pi-sparkles" /> Tryb poranny: widok prosty (tylko to, co wymaga działania dziś)
          </span>
        ) : (
          <button
            type="button"
            className="reset-layout-btn"
            onClick={handleResetLayout}
            title="Przywróć domyślny układ i szerokości kafelków"
          >
            <i className="pi pi-refresh" /> Przywróć domyślny układ
          </button>
        )}
      </div>
    </>
  );
}
