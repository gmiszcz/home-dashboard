import type {
  AcksResponse,
  DashboardItem,
  FavoriteRecord,
  FavoritesResponse,
  HealthInfo,
  LatestResponse,
  WeatherData,
} from './types';

const TOKEN_KEY = 'dashboard.readToken';

export function captureReadToken(): void {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return;
  window.localStorage.setItem(TOKEN_KEY, token);
  url.searchParams.delete('token');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

export function readToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function authHeaders(): HeadersInit {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function fetchLatest(): Promise<LatestResponse> {
  const response = await fetch('/api/latest', { headers: authHeaders(), cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<LatestResponse>;
}

export async function fetchAcks(section?: string): Promise<AcksResponse> {
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  const response = await fetch(`/api/acks${query}`, { headers: authHeaders(), cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<AcksResponse>;
}

export async function sendAck(section: string, itemId: string, kind?: string): Promise<void> {
  const response = await fetch('/api/ack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(kind ? { section, item_id: itemId, kind } : { section, item_id: itemId }),
  });
  if (!response.ok) throw new ApiError(response.status);
}

export async function removeAck(section: string, itemId: string): Promise<void> {
  const query = `section=${encodeURIComponent(section)}&item_id=${encodeURIComponent(itemId)}`;
  const response = await fetch(`/api/ack?${query}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) throw new ApiError(response.status);
}

export async function fetchFavorites(section?: string): Promise<FavoritesResponse> {
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  const response = await fetch(`/api/favorites${query}`, { headers: authHeaders(), cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<FavoritesResponse>;
}

export async function sendFavorite(section: string, itemId: string, itemData: DashboardItem): Promise<FavoriteRecord> {
  const response = await fetch('/api/favorites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ section, item_id: itemId, item_data: itemData }),
  });
  if (!response.ok) throw new ApiError(response.status);
  const data = (await response.json()) as { favorite: FavoriteRecord };
  return data.favorite;
}

export async function removeFavorite(section: string, itemId: string): Promise<void> {
  const query = `section=${encodeURIComponent(section)}&item_id=${encodeURIComponent(itemId)}`;
  const response = await fetch(`/api/favorites?${query}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) throw new ApiError(response.status);
}

export async function fetchHealth(): Promise<HealthInfo> {
  const response = await fetch('/api/health', { cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<HealthInfo>;
}

export async function fetchWeather(): Promise<WeatherData> {
  const response = await fetch('/api/weather', { cache: 'no-store' });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<WeatherData>;
}

export function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = readToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${protocol}//${window.location.host}/ws${query}`;
}
