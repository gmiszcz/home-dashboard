import type { RendererProps } from '../types';
import { extraNumber, itemKey, text } from './fields';

export function InboxRenderer({ update }: RendererProps) {
  const archived = extraNumber(update, 'archived');
  const left = extraNumber(update, 'left');
  return (
    <>
      <div className="counts">
        <div>
          <strong>{archived ?? '—'}</strong>
          <span>zarchiwizowane</span>
        </div>
        <div>
          <strong>{left ?? '—'}</strong>
          <span>zostało</span>
        </div>
      </div>
      <ul className="item-list">
        {update.items.map((item, index) => (
          <li key={itemKey(item, index)} className="stack">
            <div className="item-main">
              <span className="item-title">{text(item, 'title') ?? 'Wiadomość'}</span>
              {text(item, 'from') ? <span className="muted">{text(item, 'from')}</span> : null}
              {text(item, 'note') ? <span>{text(item, 'note')}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
