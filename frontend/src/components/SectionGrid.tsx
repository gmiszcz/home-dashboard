import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Message } from 'primereact/message';

import { warsawDateKey } from '../format';
import {
  TILE_DROP_MS,
  blocksTileDrag,
  dragOverlayPosition,
  edgeAutoScrollDelta,
  layoutViewportPoint,
  LONG_PRESS_MS,
  longPressMovedTooFar,
  nextLockedScroll,
  tileMoveTransition,
} from '../longPressDrag';
import {
  CardSpan,
  cardSpanClass,
  contentCount,
  contentFingerprint,
  filterAiDailyUpdate,
  filterJobOffersUpdate,
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
import { read, readBool, readJson, remove, write } from '../storage';
import { TILE_HIDDEN_KEY, isTileHidden, parseHiddenOverrides } from '../visibility';
import type { ConnectionMode, DashboardItem, FavoriteRecord, SectionUpdate } from '../types';
import { SectionCard } from './SectionCard';

const STORAGE_ORDER_KEY = 'dashboard_custom_order';
const STORAGE_SEEN_KEY = 'dashboard_seen_content';
const TIME_ORDER_KEY = 'dashboard_time_order';

type LiftBox = { section: string; width: number; height: number };

type LiftMetrics = LiftBox & { offsetX: number; offsetY: number };

function cardById(grid: HTMLElement | null, section: string): HTMLElement | null {
  if (!grid) return null;
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(section) : section;
  return grid.querySelector<HTMLElement>(`[data-card-id="${escaped}"]`);
}

/** Item enter animations replay when the tile moves into the overlay and back. Skip that flash. */
function silenceEnterAnimations(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.item-list li').forEach((el) => {
    el.style.animation = 'none';
  });
}

function clearHoldStyle(el: HTMLElement | null) {
  if (!el) return;
  el.style.removeProperty('user-select');
  el.style.removeProperty('-webkit-user-select');
  el.style.removeProperty('-webkit-touch-callout');
  el.style.removeProperty('touch-action');
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
  showHidden = false,
  isItemAcked,
  onAckItem,
  onUnackItem,
  getItemMark,
  onMarkItem,
  isItemStarred,
  onStarItem,
  onUnstarItem,
  getSectionFavorites,
  seenMap,
  onAcknowledgeSeen,
}: {
  sections: SectionUpdate[];
  now: Date;
  unauthorized: boolean;
  mode: ConnectionMode;
  viewMode?: 'simple' | 'full';
  /** When on, tiles with display.hidden (or a local hide) stay on the board. */
  showHidden?: boolean;
  isItemAcked?: (section: string, itemId: string) => boolean;
  onAckItem?: (section: string, itemId: string) => void;
  onUnackItem?: (section: string, itemId: string) => void;
  getItemMark?: (section: string, itemId: string) => string | undefined;
  onMarkItem?: (section: string, itemId: string, kind: string) => void;
  isItemStarred?: (section: string, itemId: string) => boolean;
  onStarItem?: (section: string, itemId: string, itemData: DashboardItem) => void;
  onUnstarItem?: (section: string, itemId: string) => void;
  getSectionFavorites?: (section: string) => FavoriteRecord[];
  // Acknowledged "Ogarnięte" fingerprint per section, from the server (synced across devices).
  seenMap?: Record<string, string>;
  onAcknowledgeSeen?: (section: string, fingerprint: string) => void;
}) {
  const [manualOrder, setManualOrder] = useState<string[] | null>(() => {
    const saved = readJson<string[]>(STORAGE_ORDER_KEY);
    return saved && saved.length > 0 ? saved : null;
  });
  const [timeOrderEnabled, setTimeOrderEnabled] = useState(() => readBool(TIME_ORDER_KEY, true));
  const [widthMap, setWidthMap] = useState<Record<string, CardSpan>>(() =>
    parseStoredWidths(read(STORAGE_WIDTH_KEY))
  );
  // Promotions "Pominięte" checkbox, stored per device. It lives here because it decides if the tile is shown.
  const [showSkipped, setShowSkipped] = useState<boolean>(() =>
    readBool(PROMOTIONS_SKIPPED_FILTER.storageKey, PROMOTIONS_SKIPPED_FILTER.defaultActive)
  );
  const [tileOverrides, setTileOverrides] = useState<Record<string, boolean>>(() =>
    parseHiddenOverrides(read(TILE_HIDDEN_KEY))
  );
  // Device-local first-run baseline. null means first run: no baseline yet. It only holds
  // the first-load snapshot so nothing shows as "fresh" on a new device; acknowledged
  // fingerprints are persisted server-side (seenMap) and never written here.
  const [baselineSeen, setBaselineSeen] = useState<Record<string, string> | null>(() =>
    readJson<Record<string, string>>(STORAGE_SEEN_KEY)
  );
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [liftBox, setLiftBox] = useState<LiftBox | null>(null);
  const [settling, setSettling] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const positionsRef = useRef<Record<string, { left: number; top: number }>>({});
  const dragItem = useRef<number | null>(null);
  const dragCardId = useRef<string | null>(null);
  const lastSwapTime = useRef<number>(0);
  const touchActiveIdx = useRef<number | null>(null);
  const sectionsRef = useRef<SectionUpdate[]>([]);
  const pressRef = useRef<{
    section: string;
    x: number;
    y: number;
    timer: number;
    el: HTMLDivElement;
  } | null>(null);
  const dragActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const stopDragListeners = useRef<(() => void) | null>(null);
  const resizeTimer = useRef<number | undefined>(undefined);
  const overlayRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<LiftMetrics | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const scrollLockRef = useRef(0);
  const scrollRafRef = useRef(0);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const settlingRef = useRef(false);
  const droppedSectionRef = useRef<string | null>(null);
  const moveDragToPointRef = useRef<(x: number, y: number) => void>(() => {});

  // Charts re-measure after a width or layout change. The timer is cleared on unmount.
  const scheduleResize = () => {
    window.clearTimeout(resizeTimer.current);
    resizeTimer.current = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  };
  useEffect(() => () => window.clearTimeout(resizeTimer.current), []);
  useEffect(
    () => () => {
      stopDragListeners.current?.();
      document.documentElement.classList.remove('is-tile-dragging');
      window.cancelAnimationFrame(scrollRafRef.current);
      window.clearTimeout(settleTimerRef.current);
      if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    },
    [],
  );

  // A saved drag order stays put. New sections are appended without replacing it.
  useEffect(() => {
    if (!manualOrder) return;
    const missing = sections.map((section) => section.section).filter((key) => !manualOrder.includes(key));
    if (missing.length === 0) return;
    const next = [...manualOrder, ...missing];
    setManualOrder(next);
    write(STORAGE_ORDER_KEY, JSON.stringify(next));
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

  // First run on this device: everything already on screen counts as acknowledged.
  // This baseline is device-local and never touches the DB.
  useEffect(() => {
    if (sections.length === 0) return;
    setBaselineSeen((prev) => {
      if (prev !== null) return prev;
      const baseline = Object.fromEntries(sections.map((s) => [s.section, contentFingerprint(s)]));
      write(STORAGE_SEEN_KEY, JSON.stringify(baseline));
      return baseline;
    });
  }, [sections]);

  // Effective acknowledged map: server marks win over the device-local first-run baseline.
  const seen = useMemo(() => {
    if (baselineSeen === null) return null;
    return { ...baselineSeen, ...(seenMap ?? {}) };
  }, [baselineSeen, seenMap]);

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
  // "AI dziś" keeps only today's articles; the sender lists earlier days there too.
  const todayKey = warsawDateKey(now);
  const filledSections = useMemo(
    () =>
      sections
        .map((update) => filterAiDailyUpdate(update, todayKey))
        .filter((update) => hasDisplayableContent(update, { getItemMark, showSkipped }))
        .filter((update) => showHidden || !isTileHidden(update, tileOverrides)),
    [sections, todayKey, getItemMark, showSkipped, showHidden, tileOverrides],
  );

  const handleToggleTileHidden = (section: string) => {
    const update = sections.find((candidate) => candidate.section === section);
    setTileOverrides((prev) => {
      const currently = update ? isTileHidden(update, prev) : Boolean(prev[section]);
      const next = { ...prev, [section]: !currently };
      write(TILE_HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  };

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
        .map((sec) => filterJobOffersUpdate(sec, getItemMark))
        .filter(
          (sec) =>
            isSimpleSection(sec, now, isItemAcked, getItemMark) ||
            (showHidden && isTileHidden(sec, tileOverrides)),
        )
        .map((sec) => {
          const revealed = showHidden && isTileHidden(sec, tileOverrides);
          return {
            ...sec,
            display: {
              ...(sec.display ?? {}),
              collapsed: false,
              max_visible: sec.display?.max_visible ?? 3,
            },
            items: revealed ? sec.items : getSimpleItems(sec, now, isItemAcked, getItemMark),
          };
        });
    }

    return sortSectionsWithMemory(activeList, displayOrder);
  }, [filledSections, displayOrder, viewMode, now, freshSections, isItemAcked, getItemMark, showHidden, tileOverrides]);
  sectionsRef.current = displaySections;

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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    nodes.forEach((n) => {
      const id = n.dataset.cardId;
      if (!id) return;
      const prev = old[id];
      const curr = current[id];
      if (!prev || !curr) return;
      const dx = prev.left - curr.left;
      const dy = prev.top - curr.top;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

      // INVERT: snap to old position, including the tile that was just picked up
      n.style.transition = 'none';
      n.style.transform = `translate(${dx}px, ${dy}px)`;
      void n.offsetHeight; // force reflow

      // PLAY: animate into the new slot
      n.style.transition = tileMoveTransition(reduceMotion);
      n.style.transform = '';

      const onEnd = () => {
        n.style.transition = '';
        n.style.transform = '';
        n.removeEventListener('transitionend', onEnd);
      };
      n.addEventListener('transitionend', onEnd);
    });
  }, [displaySections, measurePositions]);

  // The lifted tile is portaled to <body>, so a grid re-render must not pull it back to 0,0.
  // Left/top live on the DOM node. This effect only places it on pickup and on the drop.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !liftRef.current) return;
    silenceEnterAnimations(overlay);
    if (!settling) {
      const point = lastPointRef.current;
      if (!point) return;
      const pos = dragOverlayPosition(point.x, point.y, liftRef.current.offsetX, liftRef.current.offsetY);
      overlay.style.left = `${pos.left}px`;
      overlay.style.top = `${pos.top}px`;
      const pointerId = pointerIdRef.current;
      if (pointerId != null) {
        try {
          overlay.setPointerCapture(pointerId);
        } catch {
          // The slot already captured the pointer. Window listeners still follow it.
        }
      }
      return;
    }
    const slot = cardById(gridRef.current, liftRef.current.section);
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const transform = getComputedStyle(slot).transform;
    const matrix = transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix();
    const target = layoutViewportPoint(rect.left, rect.top, matrix.m41, matrix.m42);
    // The settle class has to paint once before left/top change, or the browser skips the transition.
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        overlay.style.left = `${target.left}px`;
        overlay.style.top = `${target.top}px`;
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [liftBox, settling]);

  useLayoutEffect(() => {
    const id = droppedSectionRef.current;
    if (!id || liftBox) return;
    const node = cardById(gridRef.current, id);
    if (node) silenceEnterAnimations(node);
    droppedSectionRef.current = null;
  }, [liftBox]);

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

        write(STORAGE_ORDER_KEY, JSON.stringify(next));
        return next;
      });
    },
    [capturePositions, displayOrder, displaySections, sections]
  );

  const moveDragToPoint = useCallback(
    (x: number, y: number) => {
      if (touchActiveIdx.current === null) return;
      const dragged = dragCardId.current;
      let targetSection: string | undefined;
      for (const el of document.elementsFromPoint(x, y)) {
        const cardEl = el.closest<HTMLElement>('[data-card-id]');
        const id = cardEl?.dataset.cardId;
        if (!id || id === dragged) continue;
        targetSection = id;
        break;
      }
      if (!targetSection) return;
      const targetIdx = sectionsRef.current.findIndex((s) => s.section === targetSection);
      if (targetIdx !== -1 && targetIdx !== touchActiveIdx.current) {
        handleSwap(touchActiveIdx.current, targetIdx);
        touchActiveIdx.current = targetIdx;
        dragItem.current = targetIdx;
        setDragOverIdx(targetIdx);
      }
    },
    [handleSwap],
  );
  moveDragToPointRef.current = moveDragToPoint;

  const releaseGesture = () => {
    if (pressRef.current) {
      window.clearTimeout(pressRef.current.timer);
      clearHoldStyle(pressRef.current.el);
      pressRef.current = null;
    }
    stopDragListeners.current?.();
    stopDragListeners.current = null;
    if (scrollRafRef.current) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    }
    dragActiveRef.current = false;
    document.documentElement.classList.remove('is-tile-dragging');
  };

  const clearLift = () => {
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.style.left = '';
      overlay.style.top = '';
      overlay.style.width = '';
      overlay.style.height = '';
    }
    droppedSectionRef.current = liftRef.current?.section ?? droppedSectionRef.current;
    liftRef.current = null;
    lastPointRef.current = null;
    pointerIdRef.current = null;
    settlingRef.current = false;
    touchActiveIdx.current = null;
    dragItem.current = null;
    dragCardId.current = null;
    setSettling(false);
    setLiftBox(null);
    setDragOverIdx(null);
  };

  const positionOverlay = (x: number, y: number) => {
    const overlay = overlayRef.current;
    const lift = liftRef.current;
    if (!overlay || !lift || settlingRef.current) return;
    const pos = dragOverlayPosition(x, y, lift.offsetX, lift.offsetY);
    overlay.style.left = `${pos.left}px`;
    overlay.style.top = `${pos.top}px`;
  };

  const stepAutoScroll = () => {
    scrollRafRef.current = 0;
    if (!dragActiveRef.current) return;
    const point = lastPointRef.current;
    if (point) {
      const dy = edgeAutoScrollDelta(point.y, window.innerHeight);
      if (dy !== 0) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const next = nextLockedScroll(scrollLockRef.current, dy, max);
        if (next !== scrollLockRef.current) {
          scrollLockRef.current = next;
          window.scrollTo(0, next);
          moveDragToPointRef.current(point.x, point.y);
        }
      }
    }
    scrollRafRef.current = window.requestAnimationFrame(stepAutoScroll);
  };

  const startSettle = () => {
    if (settlingRef.current) return;
    suppressClickRef.current = true;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasLift = liftRef.current != null;
    releaseGesture();
    if (!hasLift || reduceMotion) {
      clearLift();
      return;
    }
    settlingRef.current = true;
    setSettling(true);
    window.clearTimeout(settleTimerRef.current);
    // Two frames pass before left/top change, so the slide needs a little longer than TILE_DROP_MS.
    settleTimerRef.current = window.setTimeout(() => clearLift(), TILE_DROP_MS + 40);
  };

  const beginDrag = (section: string, pointerId: number) => {
    const press = pressRef.current;
    if (!press || press.section !== section || dragActiveRef.current || settlingRef.current) return;
    const idx = sectionsRef.current.findIndex((item) => item.section === section);
    const node = cardById(gridRef.current, section);
    if (idx < 0 || !node) return;
    const point = lastPointRef.current ?? { x: press.x, y: press.y };
    const rect = node.getBoundingClientRect();
    dragActiveRef.current = true;
    touchActiveIdx.current = idx;
    dragItem.current = idx;
    dragCardId.current = section;
    pointerIdRef.current = pointerId;
    lastPointRef.current = point;
    scrollLockRef.current = window.scrollY;
    window.getSelection()?.removeAllRanges();
    liftRef.current = {
      section,
      width: rect.width,
      height: rect.height,
      offsetX: point.x - rect.left,
      offsetY: point.y - rect.top,
    };
    document.documentElement.classList.add('is-tile-dragging');
    node.style.setProperty('touch-action', 'none');
    try {
      node.setPointerCapture(pointerId);
    } catch {
      // Capture can fail if the pointer already ended. Window listeners still track it.
    }
    setLiftBox({ section, width: rect.width, height: rect.height });
    armDragListeners();
    if (!scrollRafRef.current) scrollRafRef.current = window.requestAnimationFrame(stepAutoScroll);
  };

  const armDragListeners = () => {
    const track = (x: number, y: number) => {
      if (!dragActiveRef.current || settlingRef.current) return;
      lastPointRef.current = { x, y };
      positionOverlay(x, y);
      moveDragToPointRef.current(x, y);
    };
    const onMove = (moveEvent: PointerEvent) => {
      // Touch drags are driven by the touchmove listener, which is the one that can
      // preventDefault. Preventing the pointer event makes Chrome cancel it.
      if (moveEvent.pointerType === 'touch') return;
      track(moveEvent.clientX, moveEvent.clientY);
    };
    let restoringScroll = false;
    const onScroll = () => {
      if (!dragActiveRef.current || restoringScroll) return;
      if (Math.abs(window.scrollY - scrollLockRef.current) < 1) return;
      restoringScroll = true;
      window.scrollTo(0, scrollLockRef.current);
      restoringScroll = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    const stopArmed = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
    };
    const stopEarly = stopDragListeners.current;
    stopDragListeners.current = () => {
      stopEarly?.();
      stopArmed();
    };
  };

  const cancelPendingPress = () => {
    if (dragActiveRef.current || settlingRef.current) return;
    if (pressRef.current) {
      window.clearTimeout(pressRef.current.timer);
      clearHoldStyle(pressRef.current.el);
      pressRef.current = null;
    }
    stopDragListeners.current?.();
    stopDragListeners.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, section: string) => {
    if (dragActiveRef.current || settlingRef.current || liftRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (blocksTileDrag(event.target)) return;
    stopDragListeners.current?.();
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    const originX = event.clientX;
    const originY = event.clientY;
    const pointerId = event.pointerId;
    const holdEl = event.currentTarget;
    // Inline, not React state: a re-render here would hitch the scroll that may follow.
    holdEl.style.setProperty('user-select', 'none');
    holdEl.style.setProperty('-webkit-user-select', 'none');
    holdEl.style.setProperty('-webkit-touch-callout', 'none');
    lastPointRef.current = { x: originX, y: originY };
    const movedPastSlop = (x: number, y: number) => {
      const press = pressRef.current;
      if (!press || dragActiveRef.current) return;
      if (!longPressMovedTooFar(x - press.x, y - press.y)) {
        lastPointRef.current = { x, y };
        return;
      }
      cancelPendingPress();
    };
    const onWatch = (moveEvent: PointerEvent) => {
      movedPastSlop(moveEvent.clientX, moveEvent.clientY);
    };
    // Registered for the whole gesture. Chrome ignores a touchmove listener added
    // after touchstart, so this exists from the start but does not call preventDefault
    // or touch React state until the hold has already lifted the tile.
    const onWatchTouch = (touchEvent: TouchEvent) => {
      const touch = touchEvent.touches[0];
      if (!touch) return;
      if (dragActiveRef.current) {
        if (touchEvent.cancelable) touchEvent.preventDefault();
        if (!settlingRef.current) {
          lastPointRef.current = { x: touch.clientX, y: touch.clientY };
          positionOverlay(touch.clientX, touch.clientY);
          moveDragToPointRef.current(touch.clientX, touch.clientY);
        }
        return;
      }
      movedPastSlop(touch.clientX, touch.clientY);
    };
    const onUp = () => {
      if (settlingRef.current) return;
      if (dragActiveRef.current) {
        startSettle();
        return;
      }
      cancelPendingPress();
    };
    const onPointerCancel = (cancelEvent: PointerEvent) => {
      // After the lift, Chrome may cancel the pointer. touchmove preventDefault keeps the drag.
      if (dragActiveRef.current && cancelEvent.pointerType === 'touch') return;
      if (!dragActiveRef.current) {
        cancelPendingPress();
        return;
      }
      onUp();
    };
    const blockSelect = (selectEvent: Event) => {
      if (pressRef.current || dragActiveRef.current) selectEvent.preventDefault();
    };
    window.addEventListener('pointermove', onWatch, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('selectstart', blockSelect);
    window.addEventListener('contextmenu', blockSelect);
    document.addEventListener('touchmove', onWatchTouch, { passive: false, capture: true });
    document.addEventListener('touchend', onUp);
    document.addEventListener('touchcancel', onUp);
    stopDragListeners.current = () => {
      window.removeEventListener('pointermove', onWatch);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('selectstart', blockSelect);
      window.removeEventListener('contextmenu', blockSelect);
      document.removeEventListener('touchmove', onWatchTouch, { capture: true });
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
    };
    const timer = window.setTimeout(() => beginDrag(section, pointerId), LONG_PRESS_MS);
    pressRef.current = { section, x: originX, y: originY, timer, el: holdEl };
  };

  const handlePointerUp = () => {
    if (dragActiveRef.current || settlingRef.current) return;
    cancelPendingPress();
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
      write(STORAGE_WIDTH_KEY, JSON.stringify(next));
      return next;
    });
    scheduleResize();
  };

  // "Ogarnięte": remember the current content, the tile animates back to its own place.
  // The acknowledgement is persisted server-side (synced across devices). The local
  // baseline is updated optimistically so the tile settles at once even before the
  // server round-trip; the server mark (seenMap) then becomes the source of truth.
  const handleAcknowledge = (section: string) => {
    const update = sections.find((s) => s.section === section);
    if (!update) return;
    const fingerprint = contentFingerprint(update);
    capturePositions();
    setBaselineSeen((prev) => ({ ...(prev ?? {}), [section]: fingerprint }));
    onAcknowledgeSeen?.(section, fingerprint);
  };

  const handleToggleShowSkipped = (active: boolean) => {
    capturePositions();
    setShowSkipped(active);
    write(PROMOTIONS_SKIPPED_FILTER.storageKey, String(active));
  };

  const handleResetLayout = () => {
    remove(STORAGE_ORDER_KEY);
    remove(STORAGE_WIDTH_KEY);
    setWidthMap({});
    setManualOrder(null);
    scheduleResize();
  };

  const handleToggleTimeOrder = () => {
    setTimeOrderEnabled((prev) => {
      const next = !prev;
      write(TIME_ORDER_KEY, next ? '1' : '0');
      return next;
    });
  };

  const timeOrderButton = (
    <button
      type="button"
      className={`reset-layout-btn${timeOrderEnabled ? ' is-on' : ''}`}
      onClick={handleToggleTimeOrder}
      aria-pressed={timeOrderEnabled}
      aria-label="Układ dnia"
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
            Przełącz u góry na <strong>Pełny</strong>, aby zobaczyć wszystkie sekcje.
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

  const sectionCard = (update: SectionUpdate) => (
    <SectionCard
      update={update}
      now={now}
      cardSpan={getCardSpan(update.section, widthMap)}
      isFresh={viewMode === 'full' && freshSections.has(update.section)}
      onAcknowledge={() => handleAcknowledge(update.section)}
      onToggleWidth={() => handleToggleWidth(update.section)}
      isItemAcked={isItemAcked}
      onAckItem={onAckItem}
      onUnackItem={onUnackItem}
      getItemMark={getItemMark}
      onMarkItem={onMarkItem}
      isItemStarred={isItemStarred}
      onStarItem={onStarItem}
      onUnstarItem={onUnstarItem}
      getSectionFavorites={getSectionFavorites}
      showSkipped={showSkipped}
      onToggleShowSkipped={handleToggleShowSkipped}
      tileHidden={isTileHidden(update, tileOverrides)}
      onToggleHidden={() => handleToggleTileHidden(update.section)}
    />
  );
  const pointerProps = (section: string) => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => handlePointerDown(event, section),
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onClickCapture: (event: React.MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onContextMenu: (event: React.MouseEvent) => {
      if (dragActiveRef.current || settlingRef.current || suppressClickRef.current) event.preventDefault();
    },
  });

  return (
    <>
      <div className="board" ref={gridRef}>
        {displaySections.map((update, index) => {
          const lifted = liftBox?.section === update.section;
          const isDragOver = dragOverIdx === index;
          const spanClass = cardSpanClass(getCardSpan(update.section, widthMap));
          // The card div keeps a stable key so the finger's target is not destroyed when the tile lifts.
          // Destroying it makes Chrome cancel the touch and start scrolling.
          return (
            <Fragment key={update.section}>
              {lifted && liftBox ? (
                <div
                  key="slot"
                  data-card-id={update.section}
                  className={`card-wrapper is-drag-placeholder${spanClass}${isDragOver ? ' is-drag-over' : ''}`}
                  style={{ height: liftBox.height }}
                  {...pointerProps(update.section)}
                />
              ) : null}
              <div
                key="card"
                ref={lifted ? overlayRef : undefined}
                data-card-id={lifted ? undefined : update.section}
                className={
                  lifted
                    ? `tile-drag-overlay is-dragging${settling ? ' is-settling' : ''}`
                    : `card-wrapper${spanClass}${isDragOver ? ' is-drag-over' : ''}`
                }
                style={lifted && liftBox ? { width: liftBox.width, height: liftBox.height } : undefined}
                {...pointerProps(update.section)}
              >
                {sectionCard(update)}
              </div>
            </Fragment>
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
