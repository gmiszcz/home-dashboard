import { Tag } from 'primereact/tag';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, text } from './fields';

export function AiRenderer({ update }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const title = text(item, 'headline') ?? text(item, 'title') ?? 'Temat';
        const isPinned = Boolean(item.pinned);
        const priority = typeof item.priority === 'string' ? item.priority.toLowerCase() : '';
        const itemText = text(item, 'text');
        const why = text(item, 'why_it_matters');
        const tryIt = text(item, 'try_it');
        const source = text(item, 'source');

        return (
          <li key={itemKey(item, index)} className={`stack${isPinned ? ' is-pinned' : ''}`}>
            <div className="item-main">
              <div className="item-title-row">
                {isPinned ? (
                  <span className="pinned-badge" title="Przypięte">
                    <i className="pi pi-bookmark-fill" aria-hidden="true" />
                  </span>
                ) : null}
                <MaybeLink href={text(item, 'url')}>
                  <span className="item-title">{title}</span>
                </MaybeLink>
                {priority === 'high' ? (
                  <Tag value="ważne" severity="warning" rounded />
                ) : null}
              </div>
              {itemText ? <span className="item-desc">{itemText}</span> : null}
              {source ? <span className="muted">{source}</span> : null}
              {why ? <span className="why-matters">{why}</span> : null}
              {tryIt ? (
                <span className="try">
                  <i className="pi pi-arrow-right" aria-hidden="true" /> {tryIt}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
