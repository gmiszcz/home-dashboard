import type { ReactNode } from 'react';

import type { DashboardItem, SectionUpdate } from '../types';

export function text(item: DashboardItem, key: string): string | null {
  const value = item[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function amount(item: DashboardItem, key: string): number | null {
  const value = item[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function flag(item: DashboardItem, key: string): boolean {
  return item[key] === true;
}

export function record(item: DashboardItem, key: string): Record<string, unknown> | null {
  const value = item[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function recordText(source: Record<string, unknown> | null, key: string): string | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function extraNumber(update: SectionUpdate, key: string): number | null {
  const value = update.extra?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function extraText(update: SectionUpdate, key: string): string | null {
  const value = update.extra?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function itemKey(item: DashboardItem, index: number): string {
  return text(item, 'id') ?? `item-${index}`;
}

/** Returns the href only for http(s) URLs. Data comes from e-mail summaries, so it is untrusted. */
export function safeHref(href: string | null): string | null {
  if (!href) return null;
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

export function MaybeLink({ href, children }: { href: string | null; children: ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a className="quiet-link" href={safe} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function More({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null;
  return <p className="more">+ {total - shown} więcej</p>;
}
