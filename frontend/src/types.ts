export interface SectionDisplay {
  collapsed?: boolean;
  max_visible?: number;
  sort?: 'priority' | 'time' | string;
  simple?: boolean;
  /** When true, the tile stays off the board until "Pokaż ukryte kafle" is on. */
  hidden?: boolean;
}

export interface DashboardItem {
  id?: string;
  priority?: string;
  pinned?: boolean;
  simple?: boolean;
  title?: string;
  headline?: string;
  text?: string;
  status?: string;
  date?: string;
  url?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CalendarEvent {
  id?: string;
  title?: string;
  start?: string;
  end?: string | null;
  all_day?: boolean;
  location?: string | null;
  calendar?: string | null;
  provider?: 'google' | 'icloud' | string;
  color?: string | null;
  priority?: string;
  simple?: boolean;
  changed?: boolean;
  [key: string]: unknown;
}

export interface CalendarDay {
  date: string;
  label?: string;
  events: CalendarEvent[];
}

export interface CalendarWeek {
  from: string;
  to: string;
  events: CalendarEvent[];
}

export interface SectionUpdate {
  id: number;
  received_at: string;
  schema_version: number;
  section: string;
  generated_at: string;
  source?: string | null;
  title?: string | null;
  summary?: string | null;
  display?: SectionDisplay;
  items: DashboardItem[];
  extra?: Record<string, unknown>;
  /** Optional structured payload. `prad` reads `data.invoices`. Other sections ignore it. */
  data?: Record<string, unknown> | null;
  /** Bot hard-hide. The tile is not rendered. Distinct from `display.hidden`. */
  hidden?: boolean;
  layout?: string;
  days?: CalendarDay[];
  week?: CalendarWeek;
  [key: string]: unknown;
}

export interface RendererProps {
  update: SectionUpdate;
  now: Date;
  onAckItem?: (section: string, itemId: string) => void;
  isItemAcked?: (section: string, itemId: string) => boolean;
  onUnackItem?: (section: string, itemId: string) => void;
  getItemMark?: (section: string, itemId: string) => string | undefined;
  onMarkItem?: (section: string, itemId: string, kind: string) => void;
  isItemStarred?: (section: string, itemId: string) => boolean;
  onStarItem?: (section: string, itemId: string, itemData: DashboardItem) => void;
  onUnstarItem?: (section: string, itemId: string) => void;
  getSectionFavorites?: (section: string) => FavoriteRecord[];
  getSectionExclusions?: (section: string) => ExclusionRecord[];
  onExcludeOffer?: (section: string, offerId: string, url: string | null, title: string | null) => void;
  onRestoreOffer?: (section: string, offerId: string) => void;
  getSectionHidden?: (section: string) => HiddenOfferRecord[];
  onHideOffer?: (section: string, offerId: string, url: string | null, title: string | null) => void;
  onRestoreHiddenOffer?: (section: string, offerId: string) => void;
}

export type ConnectionMode = 'connecting' | 'live' | 'polling' | 'offline';

export interface HealthInfo {
  status: string;
  db: string;
  updates: number;
  stale_after_minutes: number;
  server_id?: string;
  version?: string;
}

export interface LatestResponse {
  sections: SectionUpdate[];
}

export interface AckRecord {
  section: string;
  item_id: string;
  acked_at: string;
  kind?: string;
}

export interface AcksResponse {
  acks: AckRecord[];
}

export interface FavoriteRecord {
  section: string;
  item_id: string;
  saved_at: string;
  item_data: DashboardItem;
}

export interface ExclusionRecord {
  section: string;
  offer_id: string;
  url: string | null;
  title: string | null;
  excluded_at: string;
}

export interface HiddenOfferRecord {
  section: string;
  id: string;
  url: string | null;
  title: string | null;
  hidden_at: string;
}

export interface HiddenOffersResponse {
  sections: { section: string; items: Omit<HiddenOfferRecord, 'section'>[] }[];
}

export interface HiddenSectionsResponse {
  sections: string[];
}

export interface ExclusionsResponse {
  sections: { section: string; items: Omit<ExclusionRecord, 'section'>[] }[];
}

export interface FavoritesResponse {
  favorites: FavoriteRecord[];
}

export interface WeatherCurrent {
  temp: number;
  code: number;
  condition: string;
  icon: string;
}

export interface WeatherHourlyItem {
  time: string;
  temp: number;
  code: number;
  icon: string;
  pop?: number;
}

export interface WeatherData {
  city: string;
  current: WeatherCurrent;
  hourly: WeatherHourlyItem[];
  updated_at: string;
}

export type SocketMessage =
  | { type: 'snapshot'; data: SectionUpdate[] }
  | { type: 'update'; data: SectionUpdate }
  | { type: 'ack'; data: { section: string; item_id: string; kind?: string } }
  | { type: 'unack'; data: { section: string; item_id: string } }
  | { type: 'favorite'; data: FavoriteRecord }
  | { type: 'unfavorite'; data: { section: string; item_id: string } }
  | { type: 'exclusion'; data: ExclusionRecord }
  | { type: 'unexclusion'; data: { section: string; offer_id: string } }
  | { type: 'hidden'; data: HiddenOfferRecord }
  | { type: 'unhidden'; data: { section: string; id: string } }
  | { type: 'hidden-sections'; data: { sections: string[] } }
  | { type: 'ping' }
  | { type: 'reload' };
