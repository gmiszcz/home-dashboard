import { Tag } from 'primereact/tag';

import { formatDateTime } from '../format';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, More, text } from './fields';

const LIMIT = 6;

export function GenericRenderer({ update }: RendererProps) {
  if (update.items.length === 0) return null;
  const visible = update.items.slice(0, LIMIT);
  return (
    <>
      <ul className="item-list">
        {visible.map((item, index) => {
          const title = text(item, 'title') ?? text(item, 'name') ?? 'Pozycja';
          const status = text(item, 'status');
          const date = text(item, 'date');
          const href = text(item, 'url');
          return (
            <li key={itemKey(item, index)}>
              <div className="item-main">
                <MaybeLink href={href}>
                  <span className="item-title">{title}</span>
                </MaybeLink>
                {date ? <span className="muted">{formatDateTime(date)}</span> : null}
              </div>
              {status ? <Tag value={status} severity="info" rounded /> : null}
            </li>
          );
        })}
      </ul>
      <More total={update.items.length} shown={visible.length} />
    </>
  );
}
