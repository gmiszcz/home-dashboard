export interface SectionDisplay {
  collapsed?: boolean;
  max_visible?: number;
  sort?: 'priority' | 'time' | string;
  simple?: boolean;
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
}

export interface AcksResponse {
  acks: AckRecord[];
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
  | { type: 'ack'; data: { section: string; item_id: string } }
  | { type: 'ping' };
