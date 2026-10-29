import { Chip } from 'primereact/chip';

import { EMAIL_GROUP } from '../sections';
import type { RendererProps } from '../types';
import { itemKey, text } from './fields';

export function EmailDigestRenderer({ update }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const group = text(item, 'group');
        return (
          <li key={itemKey(item, index)} className="stack">
            <div className="item-main">
              <span className="item-title">{text(item, 'subject') ?? text(item, 'title') ?? 'Wiadomość'}</span>
              {text(item, 'from') ? <span className="muted">{text(item, 'from')}</span> : null}
              {text(item, 'note') ? <span>{text(item, 'note')}</span> : null}
            </div>
            {group ? <Chip label={EMAIL_GROUP[group] ?? group} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
