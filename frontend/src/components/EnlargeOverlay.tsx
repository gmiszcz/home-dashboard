import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

import { EnlargedContext, HeaderSlotContext, SummarySlotContext } from '../renderers/headerSlot';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Next focus index when Tab or Shift+Tab is pressed inside the overlay. It wraps at both ends.
 * `current` is -1 when focus is outside the focusable list. Returns -1 when nothing can take focus.
 */
export function nextTrapIndex(current: number, count: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shiftKey ? count - 1 : 0;
  return (current + (shiftKey ? -1 : 1) + count) % count;
}

export type OverlayKeyAction = { kind: 'close' } | { kind: 'focus'; index: number } | null;

/** Maps a key press inside the overlay to an action: Esc closes, Tab cycles focus, the rest is ignored. */
export function overlayKeyAction(
  key: string,
  shiftKey: boolean,
  activeIndex: number,
  focusableCount: number,
): OverlayKeyAction {
  if (key === 'Escape') return { kind: 'close' };
  if (key === 'Tab') return { kind: 'focus', index: nextTrapIndex(activeIndex, focusableCount, shiftKey) };
  return null;
}

/** Overlay markup only: no portal and no effects, so it can be rendered on its own. */
export function EnlargePanel({
  title,
  titleId,
  onClose,
  closeRef,
  panelRef,
  setHeaderSlot,
  setSummarySlot,
  children,
}: {
  title: string;
  titleId: string;
  onClose: () => void;
  closeRef?: Ref<HTMLButtonElement>;
  panelRef?: Ref<HTMLDivElement>;
  setHeaderSlot?: (node: HTMLElement | null) => void;
  setSummarySlot?: (node: HTMLElement | null) => void;
  children?: ReactNode;
}) {
  return (
    <div className="enlarge-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef}>
      <div className="enlarge-head">
        <h2 className="enlarge-title" id={titleId}>
          {title}
        </h2>
        <div className="card-head-slot enlarge-head-slot" ref={setHeaderSlot} />
        <button
          type="button"
          className="card-action-btn enlarge-close-btn"
          ref={closeRef}
          aria-label="Zamknij widok pełnoekranowy"
          title="Zamknij (Esc)"
          onClick={onClose}
        >
          <i className="pi pi-times" aria-hidden="true" />
          <span>Zamknij</span>
        </button>
      </div>
      <div className="enlarge-body">
        <div className="summary-row">
          <div className="summary-slot" ref={setSummarySlot} />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Full-screen overlay over the dashboard. It is rendered into document.body, because a transform on
 * an ancestor (drag and drop) would break position: fixed. Esc closes it, Tab stays inside, the page
 * behind does not scroll, and focus returns to the opener on close.
 */
export function EnlargeOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [summarySlot, setSummarySlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const action = overlayKeyAction(
        event.key,
        event.shiftKey,
        focusables.indexOf(document.activeElement as HTMLElement),
        focusables.length,
      );
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'close') onClose();
      else focusables[action.index]?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <EnlargePanel
      title={title}
      titleId={titleId}
      onClose={onClose}
      closeRef={closeRef}
      panelRef={panelRef}
      setHeaderSlot={setHeaderSlot}
      setSummarySlot={setSummarySlot}
    >
      <HeaderSlotContext.Provider value={headerSlot}>
        <SummarySlotContext.Provider value={summarySlot}>
          <EnlargedContext.Provider value={true}>{children}</EnlargedContext.Provider>
        </SummarySlotContext.Provider>
      </HeaderSlotContext.Provider>
    </EnlargePanel>,
    document.body,
  );
}
