import { formatDateTime } from '../format';
import { familyCountdown, familyDays, sortFamilyEvents } from '../models/family';
import type { RendererProps } from '../types';
import { itemKey, text } from './fields';

export function FamilyEventsRenderer({ update, now }: RendererProps) {
  const items = sortFamilyEvents(update.items, now);
  if (items.length === 0) return null;
  return (
    <ul className="item-list">
      {items.map((item, index) => {
        const date = text(item, 'date');
        const days = familyDays(item, now);
        const soon = days !== null && days >= 0 && days <= 3;
        const priority = (text(item, 'priority') ?? '').toLowerCase();
        const important = priority === 'high' || priority === 'urgent' || priority === 'critical';
        return (
          <li key={itemKey(item, index)} className={soon || important ? 'highlight' : undefined}>
            <div className="item-main">
              <span className="item-title">{text(item, 'title') ?? 'Wydarzenie'}</span>
              {date ? <span className={soon ? 'deadline' : 'muted'}>{formatDateTime(date)}</span> : null}
              {text(item, 'location') ? <span className="muted">{text(item, 'location')}</span> : null}
              {text(item, 'note') ? <span className="item-desc">{text(item, 'note')}</span> : null}
            </div>
            {date ? <strong className="countdown">{familyCountdown(date, now)}</strong> : null}
          </li>
        );
      })}
    </ul>
  );
}
