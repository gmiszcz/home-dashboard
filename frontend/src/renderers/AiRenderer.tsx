import type { RendererProps } from '../types';
import { itemKey, MaybeLink, text } from './fields';

export function AiRenderer({ update }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => (
        <li key={itemKey(item, index)} className="stack">
          <div className="item-main">
            <MaybeLink href={text(item, 'url')}>
              <span className="item-title">{text(item, 'headline') ?? text(item, 'title') ?? 'Temat'}</span>
            </MaybeLink>
            {text(item, 'source') ? <span className="muted">{text(item, 'source')}</span> : null}
            {text(item, 'why_it_matters') ? <span>{text(item, 'why_it_matters')}</span> : null}
            {text(item, 'try_it') ? (
              <span className="try">
                <i className="pi pi-arrow-right" aria-hidden="true" /> {text(item, 'try_it')}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
