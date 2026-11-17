import type { DashboardItem, ExclusionRecord, HiddenOfferRecord, SectionUpdate } from './types';

/** Sections that were offer searches before the generic offers renderer existed. */
export const LEGACY_OFFER_SECTIONS = new Set(['gabinety', 'domki']);

/** True when a pushed tile should use the offers renderer, whatever its section name is. */
export function isOfferUpdate(update: Pick<SectionUpdate, 'section'> & { renderer?: unknown; type?: unknown }): boolean {
  if (update.renderer === 'offers' || update.type === 'offers') return true;
  return LEGACY_OFFER_SECTIONS.has(update.section);
}

function textOf(item: DashboardItem, key: string): string | null {
  const value = item[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Stable offer key. A numeric id is accepted so an older payload still hides. */
export function offerId(item: DashboardItem): string | null {
  const value = item.id;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function offerTitle(item: DashboardItem): string {
  return textOf(item, 'title') ?? textOf(item, 'nazwa') ?? 'Oferta';
}

export function offerUrl(item: DashboardItem): string | null {
  return textOf(item, 'url') ?? textOf(item, 'link');
}

export function offerPrice(item: DashboardItem): string | null {
  const text = textOf(item, 'price') ?? textOf(item, 'cena');
  if (text) return text;
  const value = item.price ?? item.cena;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function offerLocation(item: DashboardItem): string | null {
  return textOf(item, 'location') ?? textOf(item, 'lokalizacja');
}

/** `description`, then the older text / subtitle / opis fields. */
export function offerDescription(item: DashboardItem): string | null {
  return (
    textOf(item, 'description') ??
    textOf(item, 'text') ??
    textOf(item, 'subtitle') ??
    textOf(item, 'opis')
  );
}

/** First picture field. The caller still has to allow only http(s). */
export function offerImage(item: DashboardItem): string | null {
  return textOf(item, 'image_url') ?? textOf(item, 'image') ?? textOf(item, 'thumbnail');
}

export function offerNote(item: DashboardItem): string | null {
  return textOf(item, 'note');
}

/** Bot flag. A reserved offer sorts first and shows a green Zarezerwowane pill. */
export function offerReserved(item: DashboardItem): boolean {
  return item.reserved === true;
}

/** `badge` (one string) and `badges` (a list). The reserved pill is not repeated here. */
export function offerBadges(item: DashboardItem): string[] {
  const values: string[] = [];
  const single = textOf(item, 'badge');
  if (single) values.push(single);
  const list = item.badges;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed) values.push(trimmed);
    }
  }
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.includes(value)) unique.push(value);
  }
  return unique
    .filter((value) => !(offerReserved(item) && value.toLowerCase() === 'zarezerwowane'))
    .slice(0, 8);
}

/** Lower rank sorts first. Missing or non-numeric rank sorts last. */
export function offerRank(item: DashboardItem): number | null {
  const value = item.rank;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** Reserved first, then favorites, then rank, then the order the sender used. */
export function sortOfferItems(
  items: DashboardItem[],
  isStarred: (id: string) => boolean,
): DashboardItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftReserved = offerReserved(left.item) ? 1 : 0;
      const rightReserved = offerReserved(right.item) ? 1 : 0;
      if (leftReserved !== rightReserved) return rightReserved - leftReserved;
      const leftId = offerId(left.item);
      const rightId = offerId(right.item);
      const leftStar = leftId !== null && isStarred(leftId) ? 1 : 0;
      const rightStar = rightId !== null && isStarred(rightId) ? 1 : 0;
      if (leftStar !== rightStar) return rightStar - leftStar;
      const leftRank = offerRank(left.item);
      const rightRank = offerRank(right.item);
      if (leftRank !== null && rightRank !== null && leftRank !== rightRank) return leftRank - rightRank;
      if (leftRank !== null && rightRank === null) return -1;
      if (leftRank === null && rightRank !== null) return 1;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

/** Not interested when the offer id matches, or when both sides carry the same url. */
export function isOfferExcluded(item: DashboardItem, exclusions: ExclusionRecord[]): boolean {
  const id = offerId(item);
  const url = offerUrl(item);
  return exclusions.some(
    (row) => (id !== null && row.offer_id === id) || (url !== null && row.url !== null && row.url === url),
  );
}

/** Ukryte when the offer id matches, or when both sides carry the same url. */
export function isOfferHidden(item: DashboardItem, hidden: HiddenOfferRecord[]): boolean {
  const id = offerId(item);
  const url = offerUrl(item);
  return hidden.some(
    (row) => (id !== null && row.id === id) || (url !== null && row.url !== null && row.url === url),
  );
}
