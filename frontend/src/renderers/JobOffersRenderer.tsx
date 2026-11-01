import { Tag } from 'primereact/tag';

import { formatDateTime } from '../format';
import { NOT_INTERESTED_KIND } from '../marks';
import { ackItemKey } from '../sections';
import type { DashboardItem, RendererProps } from '../types';
import { amount, itemKey, MaybeLink, record, recordText, text } from './fields';

/** "62%" from a 0–100 match score, or null when absent / out of range. */
function matchPercent(item: DashboardItem): string | null {
  const value = amount(item, 'match_score');
  if (value === null) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return `${clamped}%`;
}

/** Severity band for the match score tag, so a strong match stands out. */
function matchSeverity(item: DashboardItem): 'success' | 'info' | 'warning' {
  const value = amount(item, 'match_score') ?? 0;
  if (value >= 75) return 'success';
  if (value >= 50) return 'info';
  return 'warning';
}

/** Human salary line: the sender's `raw`, else a min/max range, else null. */
function salaryLabel(item: DashboardItem): string | null {
  const salary = record(item, 'salary');
  if (!salary) return null;
  const raw = recordText(salary, 'raw');
  if (raw) return raw;
  const min = typeof salary.min === 'number' ? salary.min : null;
  const max = typeof salary.max === 'number' ? salary.max : null;
  const currency = recordText(salary, 'currency') ?? 'PLN';
  const period = recordText(salary, 'period');
  const suffix = `${currency}${period ? ` / ${period}` : ''}`;
  if (min !== null && max !== null) return `${min}–${max} ${suffix}`;
  if (min !== null) return `od ${min} ${suffix}`;
  if (max !== null) return `do ${max} ${suffix}`;
  return null;
}

/** Non-empty list of strings from an item field. */
function stringList(item: DashboardItem, key: string): string[] {
  const value = item[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

function MetaLine({ item }: { item: DashboardItem }) {
  const parts = [
    text(item, 'company'),
    text(item, 'city'),
    text(item, 'source'),
    salaryLabel(item) ?? 'brak stawki',
    text(item, 'work_time'),
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;
  return <span className="muted job-meta">{parts.join(' · ')}</span>;
}

function OfferDetails({ item }: { item: DashboardItem }) {
  const reasons = stringList(item, 'match_reasons');
  const concerns = stringList(item, 'concerns');
  const contract = stringList(item, 'contract');
  const postedAt = text(item, 'posted_at');
  const expiresAt = text(item, 'expires_at');

  const hasContent =
    reasons.length > 0 || concerns.length > 0 || contract.length > 0 || postedAt || expiresAt;
  if (!hasContent) return null;

  return (
    <details className="job-details">
      <summary>Szczegóły dopasowania</summary>
      <div className="job-details-body">
        {reasons.length > 0 ? (
          <ul className="job-reasons">
            {reasons.map((reason, index) => (
              <li key={`r-${index}`}>
                <i className="pi pi-check" aria-hidden="true" /> {reason}
              </li>
            ))}
          </ul>
        ) : null}
        {concerns.length > 0 ? (
          <ul className="job-concerns">
            {concerns.map((concern, index) => (
              <li key={`c-${index}`}>
                <i className="pi pi-exclamation-circle" aria-hidden="true" /> {concern}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="job-facts">
          {contract.length > 0 ? (
            <span className="job-fact">
              <span className="job-fact-label">Umowa:</span> {contract.join(', ')}
            </span>
          ) : null}
          {postedAt ? (
            <span className="job-fact">
              <span className="job-fact-label">Dodano:</span> {formatDateTime(postedAt)}
            </span>
          ) : null}
          {expiresAt ? (
            <span className="job-fact">
              <span className="job-fact-label">Ważna do:</span> {formatDateTime(expiresAt)}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export function JobOffersRenderer({
  update,
  isItemAcked,
  onAckItem,
  onUnackItem,
  getItemMark,
  onMarkItem,
  isItemStarred,
  onStarItem,
  onUnstarItem,
}: RendererProps) {
  return (
    <ul className="item-list job-list">
      {update.items.map((item, index) => {
        const title = text(item, 'title') ?? 'Oferta pracy';
        const isPinned = Boolean(item.pinned);
        const isNew = Boolean(item.is_new);
        const percent = matchPercent(item);
        const itemText = text(item, 'text');
        const why = text(item, 'why_it_matters');
        const ackKey = ackItemKey(item);
        const isRead = Boolean(ackKey && isItemAcked?.(update.section, ackKey));
        const isStarred = Boolean(ackKey && isItemStarred?.(update.section, ackKey));
        const isHidden = Boolean(ackKey && getItemMark?.(update.section, ackKey) === NOT_INTERESTED_KIND);
        const canHide = Boolean(ackKey && onMarkItem && onUnackItem);

        return (
          <li
            key={itemKey(item, index)}
            className={`stack job-item${isPinned ? ' is-pinned' : ''}${isRead ? ' is-read' : ''}`}
          >
            <div className="item-main">
              <div className="item-title-row">
                {isPinned ? (
                  <span className="pinned-badge" title="Najlepiej dopasowana">
                    <i className="pi pi-bookmark-fill" aria-hidden="true" />
                  </span>
                ) : null}
                <MaybeLink href={text(item, 'url')}>
                  <span className="item-title">{title}</span>
                </MaybeLink>
                {isNew ? <Tag value="nowa" severity="success" rounded /> : null}
                {percent ? <Tag value={percent} severity={matchSeverity(item)} rounded /> : null}
              </div>
              <MetaLine item={item} />
              {itemText ? <span className="item-desc">{itemText}</span> : null}
              {why ? <span className="why-matters">{why}</span> : null}
              <OfferDetails item={item} />
            </div>
            <div className="read-actions">
              {ackKey && (onStarItem || onUnstarItem) ? (
                <button
                  type="button"
                  className={`star-btn${isStarred ? ' is-starred' : ''}`}
                  title={isStarred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych na stałe'}
                  aria-label={isStarred ? 'Usuń z ulubionych' : 'Zapisz do ulubionych na stałe'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isStarred) {
                      onUnstarItem?.(update.section, ackKey);
                    } else {
                      onStarItem?.(update.section, ackKey, item);
                    }
                  }}
                >
                  <i className={`pi ${isStarred ? 'pi-star-fill' : 'pi-star'}`} aria-hidden="true" />
                </button>
              ) : null}
              {ackKey && (isRead ? onUnackItem : onAckItem) ? (
                isRead ? (
                  <button
                    type="button"
                    className="read-undo-btn"
                    title="Cofnij oznaczenie jako przeczytane"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnackItem?.(update.section, ackKey);
                    }}
                  >
                    <i className="pi pi-undo" aria-hidden="true" />
                    <span>Cofnij</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sec-ack-btn"
                    title="Oznacz jako przeczytane"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAckItem?.(update.section, ackKey);
                    }}
                  >
                    <i className="pi pi-check" aria-hidden="true" />
                    <span>Przeczytane</span>
                  </button>
                )
              ) : null}
              {canHide ? (
                <button
                  type="button"
                  className="job-skip-btn"
                  title={isHidden ? 'Przywróć ofertę' : 'Nie interesuje mnie, ukryj tę ofertę'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isHidden) {
                      onUnackItem?.(update.section, ackKey!);
                    } else {
                      onMarkItem?.(update.section, ackKey!, NOT_INTERESTED_KIND);
                    }
                  }}
                >
                  <i className={`pi ${isHidden ? 'pi-replay' : 'pi-eye-slash'}`} aria-hidden="true" />
                  <span>{isHidden ? 'Przywróć' : 'Nie interesuje mnie'}</span>
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
