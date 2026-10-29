import type { DashboardItem, SectionDisplay, SectionUpdate } from './types';

export interface SectionMeta {
  title: string;
  icon: string;
  wide?: boolean;
}

export const SECTION_ORDER = [
  'calendar',
  'parcels',
  'ai_daily',
  'ai_weekly',
  'email_digest',
  'promotions',
  'prices',
  'inbox_cleanup',
  'subscriptions',
  'expenses_weekly',
  'finance',
  'github_weekly',
] as const;

export const SECTION_META: Record<string, SectionMeta> = {
  calendar: { title: 'Kalendarz', icon: 'pi pi-calendar', wide: true },
  parcels: { title: 'Przesyłki', icon: 'pi pi-truck' },
  email_digest: { title: 'Poczta', icon: 'pi pi-envelope' },
  prices: { title: 'Ceny', icon: 'pi pi-tag' },
  promotions: { title: 'Promocje', icon: 'pi pi-megaphone' },
  subscriptions: { title: 'Subskrypcje', icon: 'pi pi-replay' },
  expenses_weekly: { title: 'Wydatki tygodnia', icon: 'pi pi-wallet' },
  finance: { title: 'Finanse', icon: 'pi pi-chart-bar' },
  ai_daily: { title: 'AI dziś', icon: 'pi pi-bolt' },
  ai_weekly: { title: 'AI w tym tygodniu', icon: 'pi pi-book' },
  github_weekly: { title: 'GitHub', icon: 'pi pi-github' },
  inbox_cleanup: { title: 'Skrzynka', icon: 'pi pi-inbox' },
};

export const DEFAULT_SECTION_DISPLAY: Record<string, SectionDisplay> = {
  calendar:        { collapsed: false, max_visible: 3, sort: 'time' },
  parcels:         { collapsed: false, max_visible: 3, sort: 'priority' },
  email_digest:    { collapsed: false, max_visible: 1, sort: 'priority' },
  prices:          { collapsed: false, max_visible: 3, sort: 'priority' },
  promotions:      { collapsed: false, max_visible: 3, sort: 'priority' },
  ai_daily:        { collapsed: false, max_visible: 1, sort: 'priority' },
  ai_weekly:       { collapsed: true,  max_visible: 0, sort: 'priority' },
  subscriptions:   { collapsed: true,  max_visible: 0, sort: 'priority' },
  expenses_weekly: { collapsed: true,  max_visible: 0, sort: 'priority' },
  finance:         { collapsed: true,  max_visible: 0, sort: 'priority' },
  github_weekly:   { collapsed: true,  max_visible: 0, sort: 'priority' },
  inbox_cleanup:   { collapsed: true,  max_visible: 0, sort: 'priority' },
};

export const PARCEL_STATUS: Record<string, { label: string; severity: TagSeverity }> = {
  shipped: { label: 'wysłana', severity: 'secondary' },
  in_transit: { label: 'w drodze', severity: 'info' },
  ready_for_pickup: { label: 'do odbioru', severity: 'warning' },
  picked_up: { label: 'odebrana', severity: 'success' },
  returned: { label: 'zwrócona', severity: 'danger' },
};

export const EMAIL_GROUP: Record<string, string> = {
  subscriptions_finance: 'subskrypcje i finanse',
  purchases: 'zakupy',
  parcels: 'przesyłki',
  direct: 'bezpośrednie',
  ai_newsletters: 'newslettery AI',
};

export const AVAILABILITY: Record<string, string> = {
  online_delivery: 'dostawa',
  in_store: 'w sklepie',
};

export const GITHUB_TYPE: Record<string, { label: string; severity: TagSeverity }> = {
  feature: { label: 'funkcja', severity: 'success' },
  release: { label: 'wydanie', severity: 'info' },
  fix: { label: 'poprawka', severity: 'warning' },
};

export type TagSeverity = 'success' | 'info' | 'warning' | 'danger' | 'secondary' | 'contrast';

export function sectionMeta(section: string): SectionMeta {
  return SECTION_META[section] ?? { title: section, icon: 'pi pi-th-large' };
}

export function hasPendingParcels(items?: DashboardItem[]): boolean {
  if (!items || items.length === 0) return false;
  return items.some(
    (item) => item.status && item.status !== 'picked_up' && item.status !== 'returned'
  );
}

export function defaultSectionRank(section: string, pendingParcels = false): number {
  if (section === 'calendar') return 10;
  if (section === 'parcels') {
    return pendingParcels ? 15 : 65;
  }
  if (section === 'ai_daily') return 20;
  if (section === 'ai_weekly') return 25;
  if (section === 'email_digest') return 30;
  if (section === 'promotions') return 40;
  if (section === 'prices') return 50;
  if (section === 'inbox_cleanup') return 70;
  if (section === 'subscriptions') return 80;
  if (section === 'expenses_weekly') return 85;
  if (section === 'finance') return 90;
  if (section === 'github_weekly') return 95;
  return 60;
}

export function sectionRank(section: string, update?: SectionUpdate): number {
  const isPending = update?.section === 'parcels' ? hasPendingParcels(update.items) : false;
  return defaultSectionRank(section, isPending);
}

export function sortItems(items: DashboardItem[], sortMode?: string): DashboardItem[] {
  if (!items || items.length <= 1) return items ?? [];
  const copy = [...items];
  if (sortMode === 'time') {
    return copy.sort((a, b) => {
      const tA = String(a.start ?? a.date ?? a.deadline ?? '');
      const tB = String(b.start ?? b.date ?? b.deadline ?? '');
      return tA.localeCompare(tB);
    });
  }
  return copy.sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;

    const score = (p?: unknown) => {
      const s = typeof p === 'string' ? p.toLowerCase() : '';
      if (s === 'high' || s === 'urgent' || s === 'critical') return 3;
      if (s === 'normal' || s === 'medium') return 2;
      if (s === 'low') return 1;
      return 1.5;
    };
    return score(b.priority) - score(a.priority);
  });
}
