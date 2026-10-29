export interface SectionMeta {
  title: string;
  icon: string;
  wide?: boolean;
}

export const SECTION_ORDER = [
  'calendar',
  'parcels',
  'email_digest',
  'prices',
  'promotions',
  'subscriptions',
  'expenses_weekly',
  'finance',
  'ai_daily',
  'ai_weekly',
  'github_weekly',
  'inbox_cleanup',
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

export function sectionRank(section: string): number {
  const index = SECTION_ORDER.indexOf(section as (typeof SECTION_ORDER)[number]);
  return index === -1 ? SECTION_ORDER.length : index;
}
