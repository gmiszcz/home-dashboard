import type { CSSProperties } from 'react';
import { Tag } from 'primereact/tag';

import {
  addDaysKey,
  dateKeyFromField,
  formatDayLabel,
  formatTime,
  warsawDateKey,
} from '../format';
import { calendarFocusKey, daypart, hasCalendarLayout } from '../sections';
import type { CalendarEvent, DashboardItem, RendererProps, SectionUpdate } from '../types';
import { flag, itemKey, text } from './fields';

/** Fallback colors when the sender gives no `color`. Picked by calendar name, stable per calendar. */
const FALLBACK_COLORS = ['#4CD964', '#039BE5', '#FF9500', '#AF52DE', '#FF2D55', '#5AC8FA', '#F4B400'];

const PROVIDER_ICON: Record<string, { icon: string; label: string }> = {
  icloud: { icon: 'pi pi-apple', label: 'iCloud' },
  google: { icon: 'pi pi-google', label: 'Google' },
};

const HIGH_PRIORITY = new Set(['high', 'urgent', 'critical']);

export function CalendarRenderer({ update, now }: RendererProps) {
  if (hasCalendarLayout(update)) return <CalendarBoard update={update} now={now} />;
  return <LegacyCalendar update={update} now={now} />;
}

function eventColor(event: CalendarEvent): string {
  if (typeof event.color === 'string' && event.color.trim()) return event.color;
  const key = `${event.provider ?? ''}:${event.calendar ?? ''}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function eventWhen(event: CalendarEvent): string {
  if (event.all_day === true) return 'cały dzień';
  return [event.start, event.end]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map(formatTime)
    .join('–');
}

/** All-day events first, then by start time. */
function byStart(left: CalendarEvent, right: CalendarEvent): number {
  const allDay = Number(right.all_day === true) - Number(left.all_day === true);
  if (allDay !== 0) return allDay;
  return String(left.start ?? '').localeCompare(String(right.start ?? ''));
}

function EventList({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return <p className="muted">Brak wydarzeń</p>;
  return (
    <ul className="item-list cal-events">
      {[...events].sort(byStart).map((event, index) => {
        const provider = PROVIDER_ICON[String(event.provider ?? '')];
        const calendar = typeof event.calendar === 'string' ? event.calendar.trim() : '';
        const location = typeof event.location === 'string' ? event.location.trim() : '';
        const isHigh = HIGH_PRIORITY.has(String(event.priority ?? '').toLowerCase());
        const style = { '--cal-color': eventColor(event) } as CSSProperties;
        return (
          <li key={event.id ?? `event-${index}`} className="cal-event" style={style}>
            <div className="item-main">
              <span className="item-title">{event.title?.trim() || 'Wydarzenie'}</span>
              <span className="when-line">{eventWhen(event)}</span>
              {provider || calendar || location ? (
                <span className="cal-meta">
                  {provider ? (
                    <i className={provider.icon} title={provider.label} aria-label={provider.label} />
                  ) : null}
                  {calendar ? <span className="cal-name">{calendar}</span> : null}
                  {location ? <span className="cal-location">{location}</span> : null}
                </span>
              ) : null}
            </div>
            {isHigh || event.changed === true ? (
              <div className="tag-row">
                {isHigh ? <Tag value="ważne" severity="danger" rounded /> : null}
                {event.changed === true ? <Tag value="zmienione" severity="warning" rounded /> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function CalendarBoard({ update, now }: { update: SectionUpdate; now: Date }) {
  const today = warsawDateKey(now);
  const focus = calendarFocusKey(now);
  const evening = daypart(now) === 'evening';
  const days = update.days ?? [];
  const week = update.week;

  // Week events grouped by their Warsaw start date, in date order
  const weekGroups = new Map<string, CalendarEvent[]>();
  for (const event of week?.events ?? []) {
    const key = (event.start ? dateKeyFromField(event.start) : null) ?? '';
    weekGroups.set(key, [...(weekGroups.get(key) ?? []), event]);
  }
  const weekKeys = [...weekGroups.keys()].sort();

  return (
    <div className={`cal-board${week ? '' : ' no-week'}`}>
      <div className="cal-days">
        {days.map((day) => (
          <section
            key={day.date}
            className={`cal-col${day.date === today ? ' is-today' : ''}${evening && day.date === focus ? ' is-focus' : ''}`}
          >
            <h3>{day.label?.trim() || formatDayLabel(day.date)}</h3>
            <EventList events={day.events ?? []} />
          </section>
        ))}
      </div>
      {week ? (
        <section className="cal-week">
          <h3>
            Kolejne 7 dni{' '}
            <span className="cal-range">
              {formatDayLabel(week.from)} – {formatDayLabel(week.to)}
            </span>
          </h3>
          {weekKeys.length === 0 ? <p className="muted">Brak wydarzeń</p> : null}
          {weekKeys.map((key) => (
            <div key={key} className="cal-week-day">
              <h4>{key ? formatDayLabel(key) : 'Bez daty'}</h4>
              <EventList events={weekGroups.get(key) ?? []} />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** Older payload: a flat `items` list grouped into Dziś / Jutro / Później. */
function LegacyCalendar({ update, now }: RendererProps) {
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
