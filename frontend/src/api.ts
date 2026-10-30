import type { HealthInfo, LatestResponse, WeatherData } from './types';

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
