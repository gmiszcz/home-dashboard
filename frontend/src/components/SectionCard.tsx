import { useEffect, useRef, useState } from 'react';
import { Badge } from 'primereact/badge';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';

import { dataFreshness, formatDateTime, formatRelative, FRESHNESS_LABELS, plural } from '../format';
import { SectionBody } from '../renderers';
import { ExpandControlContext, HeaderSlotContext, SummarySlotContext } from '../renderers/headerSlot';
import {
  CALENDAR_FILTERS,
  CardSpan,
  cardSpanClass,
  contentCount,
  contentFingerprint,
  DEFAULT_SECTION_DISPLAY,
  filterCalendarUpdate,
  getCardSpan,
  sectionMeta,
  sortSectionItems,
} from '../sections';
import type { SectionUpdate } from '../types';

export function SectionCard({
  update,
  now,
  cardSpan,
  isFresh = false,
  onAcknowledge,
  onToggleWidth,
  dragHandleProps,
  isItemAcked,
  onAckItem,
  onUnackItem,
}: {
  update: SectionUpdate;
  now: Date;
  cardSpan?: CardSpan;
  isFresh?: boolean;
  onAcknowledge?: () => void;
  onToggleWidth?: () => void;
  dragHandleProps?: Record<string, unknown>;
  isItemAcked?: (section: string, itemId: string) => boolean;
  onAckItem?: (section: string, itemId: string) => void;
  onUnackItem?: (section: string, itemId: string) => void;
}) {
  const meta = sectionMeta(update.section);
  const freshness = dataFreshness(update.generated_at, now);
  const title = update.title?.trim() || meta.title;

  const defaultDisplay = DEFAULT_SECTION_DISPLAY[update.section] ?? {
    collapsed: false,
    max_visible: 3,
    sort: 'priority',
  };
  const display = { ...defaultDisplay, ...(update.display ?? {}) };

  const [isCollapsed, setIsCollapsed] = useState<boolean>(display.collapsed ?? false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [summarySlot, setSummarySlot] = useState<HTMLElement | null>(null);
  const [canExpand, setCanExpand] = useState<boolean>(true);

  // Calendar category filters (Święta, Urodziny, etc.)
  const [calFilters, setCalFilters] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const filter of CALENDAR_FILTERS) {
      try {
        const stored = localStorage.getItem(filter.storageKey);
        initial[filter.id] = stored !== null ? stored === 'true' : filter.defaultActive;
      } catch {
        initial[filter.id] = filter.defaultActive;
      }
    }
    return initial;
  });

  const handleToggleCalFilter = (filterId: string, active: boolean) => {
    setCalFilters((prev) => {
      const next = { ...prev, [filterId]: active };
      const config = CALENDAR_FILTERS.find((f) => f.id === filterId);
      if (config) {
        try {
          localStorage.setItem(config.storageKey, String(active));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const effectiveUpdate =
    update.section === 'calendar' ? filterCalendarUpdate(update, calFilters) : update;

  // New content should be readable right away, even in a tile collapsed by default
  useEffect(() => {
    if (isFresh) setIsCollapsed(false);
  }, [isFresh]);

  // Short pulse when the content changes; skipped on first mount
  const fingerprint = contentFingerprint(effectiveUpdate);
  const lastFingerprint = useRef(fingerprint);
  const [isUpdated, setIsUpdated] = useState(false);
  useEffect(() => {
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    setIsUpdated(true);
    const timer = window.setTimeout(() => setIsUpdated(false), 1200);
    return () => window.clearTimeout(timer);
  }, [fingerprint]);

  const sortedItems = sortSectionItems(
    update.section,
    effectiveUpdate.items,
    display.sort,
    isItemAcked,
  );
  const maxVisible = display.max_visible ?? 3;

  const showAll = isExpanded || maxVisible === 0 || maxVisible >= sortedItems.length;
  const visibleItems = isCollapsed ? [] : (showAll ? sortedItems : sortedItems.slice(0, maxVisible));
  const hiddenCount = sortedItems.length - visibleItems.length;

  const visibleUpdate: SectionUpdate = {
    ...effectiveUpdate,
    items: visibleItems,
  };

  const count = contentCount(effectiveUpdate);
  const isEmpty = count === 0;
  const span = cardSpan ?? getCardSpan(update.section, {});
  const spanClass = cardSpanClass(span);

  return (
    <Card className={`section-card${spanClass}${isFresh ? ' is-fresh' : ''}${isUpdated ? ' is-updated' : ''}${isCollapsed ? ' is-collapsed' : ''}${isEmpty ? ' is-empty' : ''}`}>
      <div
        className="card-head clickable"
        onClick={() => setIsCollapsed(!isCollapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }
        }}
      >
        <div className="card-head-left">
          <i className={`card-icon ${meta.icon}`} aria-hidden="true" />
          <h2>{title}</h2>
          <i
            className={`collapse-icon pi ${isCollapsed ? 'pi-chevron-down' : 'pi-chevron-up'}`}
            title={isCollapsed ? 'Rozwiń sekcję' : 'Zwiń sekcję'}
            aria-hidden="true"
          />
          {isFresh ? <Tag value="nowe" severity="success" rounded /> : null}
          <span
            className={`freshness-led is-${freshness}`}
            role="img"
            title={FRESHNESS_LABELS[freshness]}
            aria-label={FRESHNESS_LABELS[freshness]}
          />
        </div>

        <div
          className="card-head-slot"
          ref={setHeaderSlot}
          onClick={(event) => event.stopPropagation()}
        >
          {update.section === 'calendar' ? (
            <div className="cal-head-filters" onClick={(e) => e.stopPropagation()}>
              {CALENDAR_FILTERS.map((f) => (
                <label
                  key={f.id}
                  className={`cal-filter-label${calFilters[f.id] ? ' is-active' : ''}`}
                  title={`Filtruj: ${f.label}`}
                >
                  <input
                    type="checkbox"
                    checked={calFilters[f.id] ?? true}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleToggleCalFilter(f.id, e.target.checked);
                    }}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card-head-right">
          {count > 0 ? <Badge value={count} className="card-count-badge" /> : null}
          <span className="ago" title={formatDateTime(update.generated_at)}>
            {formatRelative(update.generated_at, now)}
          </span>
          {isFresh && onAcknowledge ? (
            <button
              type="button"
              className="card-ack-btn"
              title="Oznacz jako ogarnięte, kafel wróci na swoje miejsce"
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
            >
              <i className="pi pi-check" aria-hidden="true" />
              <span>Ogarnięte</span>
            </button>
          ) : null}
          {onToggleWidth ? (
            <button
              type="button"
              className={`card-action-btn width-toggle-btn span-${span}${span > 1 ? ' is-active' : ''}`}
              title={
                span === 1
                  ? 'Szerokość: 1 kolumna (1/3). Kliknij, aby zmienić na 2 kolumny (2/3)'
                  : span === 2
                  ? 'Szerokość: 2 kolumny (2/3). Kliknij, aby zmienić na pełną szerokość (3/3)'
                  : 'Szerokość: pełna (3/3). Kliknij, aby zmniejszyć do 1 kolumny (1/3)'
              }
              aria-label={`Zmień szerokość kafla (aktualnie ${span}/3)`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleWidth();
              }}
            >
              <span className="grid-width-bars" aria-hidden="true">
                <span className={`width-bar ${span >= 1 ? 'is-active' : ''}`} />
                <span className={`width-bar ${span >= 2 ? 'is-active' : ''}`} />
                <span className={`width-bar ${span >= 3 ? 'is-active' : ''}`} />
              </span>
            </button>
          ) : null}
          <span
            className="drag-handle"
            title="Przeciągnij palcem lub myszką, aby przenieść"
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
          >
            <i className="pi pi-bars" aria-hidden="true" />
          </span>
        </div>
      </div>

      <HeaderSlotContext.Provider value={headerSlot}>
      <SummarySlotContext.Provider value={summarySlot}>
      <ExpandControlContext.Provider value={setCanExpand}>
      {isCollapsed ? (
        <div className="collapsed-teaser" onClick={() => setIsCollapsed(false)}>
          {effectiveUpdate.summary ? <span className="summary-preview">{effectiveUpdate.summary}</span> : null}
          <span className="expand-hint">
            <i className="pi pi-angle-down" /> Kliknij, aby rozwinąć ({count} {plural(count, 'pozycja', 'pozycje', 'pozycji')})
          </span>
        </div>
      ) : (
        <>
          {effectiveUpdate.summary || update.section === 'expenses_weekly' ? (
            <div className="summary-row">
              {effectiveUpdate.summary ? <p className="summary">{effectiveUpdate.summary}</p> : null}
              <div className="summary-slot" ref={setSummarySlot} />
            </div>
          ) : null}
          <SectionBody
            update={visibleUpdate}
            now={now}
            isItemAcked={isItemAcked}
            onAckItem={onAckItem}
            onUnackItem={onUnackItem}
          />
          {isEmpty && !effectiveUpdate.summary ? (
            <p className="empty-section-hint">Brak pozycji</p>
          ) : null}
          {canExpand && maxVisible > 0 && sortedItems.length > maxVisible ? (
            <div className="more-row">
              <button
                type="button"
                className="more-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                <i className={`pi ${isExpanded ? 'pi-chevron-up' : 'pi-chevron-down'}`} />{' '}
                {isExpanded
                  ? `Zwiń do ${maxVisible}`
                  : `Pokaż jeszcze ${hiddenCount} (rozwiń)`}
              </button>
            </div>
          ) : null}
        </>
      )}
      </ExpandControlContext.Provider>
      </SummarySlotContext.Provider>
      </HeaderSlotContext.Provider>
    </Card>
  );
}
