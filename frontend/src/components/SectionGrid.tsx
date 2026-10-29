import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Message } from 'primereact/message';

import type { ConnectionMode, SectionUpdate } from '../types';
import { sectionMeta } from '../sections';
import { SectionCard } from './SectionCard';

const STORAGE_ORDER_KEY = 'dashboard_custom_order';
const STORAGE_WIDTH_KEY = 'dashboard_custom_widths';

function loadStoredOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function loadStoredWidths(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_WIDTH_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function SectionGrid({
  sections,
  now,
  staleMinutes,
  unauthorized,
  mode,
}: {
  sections: SectionUpdate[];
  now: Date;
  staleMinutes: number;
  unauthorized: boolean;
  mode: ConnectionMode;
}) {
  const [orderedSections, setOrderedSections] = useState<SectionUpdate[]>(sections);
  const [fullWidthMap, setFullWidthMap] = useState<Record<string, boolean>>(loadStoredWidths);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Record<string, DOMRect>>({});
  const dragItem = useRef<number | null>(null);
  const dragCardId = useRef<string | null>(null);
  const lastSwapTime = useRef<number>(0);
  const touchActiveIdx = useRef<number | null>(null);

  // Synchronize incoming sections with stored order
  useEffect(() => {
    const savedOrder = loadStoredOrder();
    if (!savedOrder || savedOrder.length === 0) {
      setOrderedSections(sections);
      return;
    }

    const sectionMap = new Map(sections.map((s) => [s.section, s]));
    const result: SectionUpdate[] = [];

    // Add sections in saved order
    for (const key of savedOrder) {
      const match = sectionMap.get(key);
      if (match) {
        result.push(match);
        sectionMap.delete(key);
      }
    }
    // Append any newly arrived sections
    for (const remaining of sectionMap.values()) {
      result.push(remaining);
    }

    setOrderedSections(result);
  }, [sections]);

  const capturePositions = useCallback(() => {
    if (!gridRef.current) return;
    const nodes = gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]');
    nodes.forEach((n) => {
      n.style.transition = 'none';
      n.style.transform = '';
    });
    const pos: Record<string, DOMRect> = {};
    nodes.forEach((n) => {
      const id = n.dataset.cardId;
      if (id) pos[id] = n.getBoundingClientRect();
    });
    positionsRef.current = pos;
  }, []);

  // FLIP animation on array reorder
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const old = positionsRef.current;
    if (!Object.keys(old).length) return;
    const nodes = gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]');
    const dragId = dragCardId.current;

    nodes.forEach((n) => {
      const id = n.dataset.cardId;
      if (!id || (dragId != null && String(dragId) === id)) return;
      const prev = old[id];
      if (!prev) return;
      const curr = n.getBoundingClientRect();
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

      // INVERT: snap to old position
      n.style.transition = 'none';
      n.style.transform = `translate(${dx}px, ${dy}px)`;
      void n.offsetHeight; // force reflow

      // PLAY: animate to new position
      n.style.transition = 'transform 0.25s ease';
      n.style.transform = '';

      const onEnd = () => {
        n.style.transition = '';
        n.style.transform = '';
        n.removeEventListener('transitionend', onEnd);
      };
      n.addEventListener('transitionend', onEnd);
    });

    positionsRef.current = {};
  }, [orderedSections]);

  const handleSwap = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
      const nowTs = Date.now();
      if (nowTs - lastSwapTime.current < 180) return;
      lastSwapTime.current = nowTs;

      capturePositions();
      setOrderedSections((prev) => {
        const reordered = [...prev];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        try {
          localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(reordered.map((s) => s.section)));
        } catch {
          // ignore localStorage error
        }
        return reordered;
      });
    },
    [capturePositions]
  );

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragItem.current = idx;
    dragCardId.current = orderedSections[idx].section;
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', orderedSections[idx].section);
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
    dragCardId.current = orderedSections[idx]?.section ?? null;
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
    const targetIdx = orderedSections.findIndex((s) => s.section === targetSection);
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

  const handleToggleWidth = (section: string) => {
    if (gridRef.current) {
      gridRef.current.querySelectorAll<HTMLElement>('[data-card-id]').forEach((n) => {
        n.style.transition = '';
        n.style.transform = '';
      });
    }
    setFullWidthMap((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        localStorage.setItem(STORAGE_WIDTH_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetLayout = () => {
    localStorage.removeItem(STORAGE_ORDER_KEY);
    localStorage.removeItem(STORAGE_WIDTH_KEY);
    setFullWidthMap({});
    setOrderedSections(sections);
  };

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

  return (
    <>
      <div className="board" ref={gridRef} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        {orderedSections.map((update, index) => {
          const isDragging = draggingIdx === index;
          const isDragOver = dragOverIdx === index;
          const isFullWidth = fullWidthMap[update.section] ?? false;
          const meta = sectionMeta(update.section);
          const spanClass = isFullWidth ? ' span-full' : (meta.wide ? ' span-2' : '');
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
                staleMinutes={staleMinutes}
                isFullWidth={isFullWidth}
                onToggleWidth={() => handleToggleWidth(update.section)}
                dragHandleProps={{
                  onTouchStart: () => handleTouchStart(index),
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="grid-footer">
        <button type="button" className="reset-layout-btn" onClick={handleResetLayout} title="Przywróć domyślny układ i szerokości kafelków">
          <i className="pi pi-refresh" /> Przywróć domyślny układ
        </button>
      </div>
    </>
  );
}
