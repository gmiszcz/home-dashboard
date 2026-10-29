export interface SectionDisplay {
  collapsed?: boolean;
  max_visible?: number;
  sort?: 'priority' | 'time' | string;
}

export interface DashboardItem {
  id?: string;
  priority?: string;
  pinned?: boolean;
  title?: string;
  headline?: string;
  text?: string;
  status?: string;
  date?: string;
  url?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export type ConnectionMode = 'connecting' | 'live' | 'polling' | 'offline';

export interface HealthInfo {
  status: string;
  db: string;
  updates: number;
  stale_after_minutes: number;
}

export interface LatestResponse {
  sections: SectionUpdate[];
}

export interface SnapshotMessage {
  type: 'snapshot';
  data: SectionUpdate[];
}

export interface UpdateMessage {
  type: 'update';
  data: SectionUpdate;
}

export interface PingMessage {
  type: 'ping';
}

export type SocketMessage = SnapshotMessage | UpdateMessage | PingMessage;

export interface RendererProps {
  update: SectionUpdate;
  now: Date;
}
