import { useEffect, useRef, useState } from 'react';
import { Badge } from 'primereact/badge';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';

import { formatDateTime, formatRelative, isStale } from '../format';
import { SectionBody } from '../renderers';
import { contentFingerprint, DEFAULT_SECTION_DISPLAY, sectionMeta, sortItems } from '../sections';
import type { SectionUpdate } from '../types';

export function SectionCard({
  update,
  now,
  staleMinutes,
  isFullWidth,
  isFresh = false,
  onAcknowledge,
  onToggleWidth,
  dragHandleProps,
}: {
  update: SectionUpdate;
  now: Date;
  staleMinutes: number;
  isFullWidth?: boolean;
  isFresh?: boolean;
  onAcknowledge?: () => void;
  onToggleWidth?: () => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const meta = sectionMeta(update.section);
  const stale = isStale(update.generated_at, now, staleMinutes);
  const title = update.title?.trim() || meta.title;

  const defaultDisplay = DEFAULT_SECTION_DISPLAY[update.section] ?? {
    collapsed: false,
    max_visible: 3,
    sort: 'priority',
  };
  const display = { ...defaultDisplay, ...(update.display ?? {}) };

  const [isCollapsed, setIsCollapsed] = useState<boolean>(display.collapsed ?? false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // New content should be readable right away, even in a tile collapsed by default
  useEffect(() => {
    if (isFresh) setIsCollapsed(false);
  }, [isFresh]);

  // Short pulse when the content changes; skipped on first mount
  const fingerprint = contentFingerprint(update);
  const lastFingerprint = useRef(fingerprint);
  const [isUpdated, setIsUpdated] = useState(false);
  useEffect(() => {
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;
    setIsUpdated(true);
    const timer = window.setTimeout(() => setIsUpdated(false), 1200);
    return () => window.clearTimeout(timer);
  }, [fingerprint]);

  const sortedItems = sortItems(update.items, display.sort);
  const maxVisible = display.max_visible ?? 3;

  const showAll = isExpanded || maxVisible === 0 || maxVisible >= sortedItems.length;
  const visibleItems = isCollapsed ? [] : (showAll ? sortedItems : sortedItems.slice(0, maxVisible));
  const hiddenCount = sortedItems.length - visibleItems.length;

  const visibleUpdate: SectionUpdate = {
    ...update,
    items: visibleItems,
  };

  const isEmpty = update.items.length === 0;
  const spanClass = isFullWidth ? ' span-full' : (meta.wide ? ' span-2' : '');

  return (
    <Card className={`section-card${spanClass}${isFresh ? ' is-fresh' : ''}${isUpdated ? ' is-updated' : ''}${stale ? ' is-stale' : ''}${isCollapsed ? ' is-collapsed' : ''}${isEmpty ? ' is-empty' : ''}`}>
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
          {stale ? <Tag value="nieaktualne" severity="warning" rounded /> : null}
        </div>

        <div className="card-head-right">
          {update.items.length > 0 ? <Badge value={update.items.length} /> : null}
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
              className={`card-action-btn${isFullWidth ? ' is-active' : ''}`}
              title={isFullWidth ? 'Zmniejsz szerokość (standardowa)' : 'Rozszerz na 100% szerokości'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleWidth();
              }}
            >
              <i className={`pi ${isFullWidth ? 'pi-arrows-h' : 'pi-arrows-alt'}`} />
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

      {isCollapsed ? (
        <div className="collapsed-teaser" onClick={() => setIsCollapsed(false)}>
          {update.summary ? <span className="summary-preview">{update.summary}</span> : null}
          <span className="expand-hint">
            <i className="pi pi-angle-down" /> Kliknij, aby rozwinąć ({update.items.length} {update.items.length === 1 ? 'pozycja' : 'pozycji'})
          </span>
        </div>
      ) : (
        <>
          {update.summary ? <p className="summary">{update.summary}</p> : null}
          <SectionBody update={visibleUpdate} now={now} />
          {isEmpty && !update.summary ? (
            <p className="empty-section-hint">Brak pozycji</p>
          ) : null}
          {maxVisible > 0 && sortedItems.length > maxVisible ? (
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
    </Card>
  );
}
