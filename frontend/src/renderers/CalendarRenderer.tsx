import { Tag } from 'primereact/tag';

import { addDaysKey, dateKeyFromField, formatTime, warsawDateKey } from '../format';
import type { DashboardItem, RendererProps } from '../types';
import { flag, itemKey, text } from './fields';

export function CalendarRenderer({ update, now }: RendererProps) {
  const today = warsawDateKey(now);
  const tomorrow = addDaysKey(today, 1);
  const groups = [
    { key: today, label: 'Dziś', items: [] as DashboardItem[] },
    { key: tomorrow, label: 'Jutro', items: [] as DashboardItem[] },
    { key: 'later', label: 'Później', items: [] as DashboardItem[] },
  ];
  for (const item of update.items) {
    const start = text(item, 'start');
    const key = start ? dateKeyFromField(start) : null;
    if (key === today) groups[0].items.push(item);
    else if (key === tomorrow) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  const visible = groups.filter((group) => group.items.length > 0 || group.key !== 'later');
  return (
    <div className="split">
      {visible.map((group) => (
        <section key={group.label} className="split-col">
          <h3>{group.label}</h3>
          {group.items.length === 0 ? <p className="muted">Brak wydarzeń</p> : null}
          <ul className="item-list">
            {group.items.map((item, index) => {
              const start = text(item, 'start');
              const end = text(item, 'end');
              const allDay = flag(item, 'all_day');
              const when = allDay
                ? 'cały dzień'
                : [start ? formatTime(start) : null, end ? formatTime(end) : null]
                    .filter(Boolean)
                    .join('–');
              return (
                <li key={itemKey(item, index)} className="stack">
                  <div className="item-main">
                    <span className="item-title">{text(item, 'title') ?? 'Wydarzenie'}</span>
                    <span className="when-line">{when}</span>
                  </div>
                  <div className="tag-row">
                    {flag(item, 'changed') ? <Tag value="zmienione" severity="warning" rounded /> : null}
                    {text(item, 'location') ? <span className="muted">{text(item, 'location')}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
