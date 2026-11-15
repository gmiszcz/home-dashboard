import { useState } from 'react';
import { Tag } from 'primereact/tag';

import { formatDateTime } from '../format';
import type { DashboardItem, RendererProps } from '../types';
import { itemKey, MaybeLink, More, safeHref, text } from './fields';

const LIMIT = 6;

/** First usable picture. Payloads are untrusted, so only http(s) URLs are shown. */
function itemImage(item: DashboardItem): string | null {
  for (const key of ['image_url', 'image', 'thumbnail']) {
    const href = safeHref(text(item, key));
    if (href) return href;
  }
  return null;
}

function GenericItem({ item }: { item: DashboardItem }) {
  const title = text(item, 'title') ?? text(item, 'name') ?? 'Pozycja';
  const description = text(item, 'text') ?? text(item, 'subtitle') ?? text(item, 'description');
  const status = text(item, 'status');
  const date = text(item, 'date');
  const href = text(item, 'url');
  const image = itemImage(item);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = image !== null && !imageFailed;

  return (
    <li>
      <div className={showImage ? 'item-main has-thumb' : 'item-main'}>
        <MaybeLink href={href}>
          {showImage && image ? (
            <span className="item-thumb-slot">
              <img
                className="item-thumb"
                src={image}
                alt={title}
                loading="lazy"
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setImageFailed(true)}
              />
            </span>
          ) : null}
          <span className="item-title">{title}</span>
        </MaybeLink>
        {description ? <span className="item-desc">{description}</span> : null}
        {date ? <span className="muted">{formatDateTime(date)}</span> : null}
      </div>
      {status ? <Tag value={status} severity="info" rounded /> : null}
    </li>
  );
}

export function GenericRenderer({ update }: RendererProps) {
  if (update.items.length === 0) return null;
  const visible = update.items.slice(0, LIMIT);
  return (
    <>
      <ul className="item-list">
        {visible.map((item, index) => (
          <GenericItem key={itemKey(item, index)} item={item} />
        ))}
      </ul>
      <More total={update.items.length} shown={visible.length} />
    </>
  );
}
