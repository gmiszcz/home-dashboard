import { Tag } from 'primereact/tag';

import { GITHUB_TYPE } from '../sections';
import type { RendererProps } from '../types';
import { itemKey, MaybeLink, text } from './fields';

export function GithubRenderer({ update }: RendererProps) {
  return (
    <ul className="item-list">
      {update.items.map((item, index) => {
        const kind = text(item, 'type');
        const meta = kind ? GITHUB_TYPE[kind] : undefined;
        return (
          <li key={itemKey(item, index)}>
            <div className="item-main">
              <MaybeLink href={text(item, 'url')}>
                <span className="item-title">{text(item, 'repo') ?? text(item, 'title') ?? 'Repozytorium'}</span>
              </MaybeLink>
              {text(item, 'version') ? <span className="muted">{text(item, 'version')}</span> : null}
            </div>
            {kind ? <Tag value={meta?.label ?? kind} severity={meta?.severity ?? 'secondary'} rounded /> : null}
          </li>
        );
      })}
    </ul>
  );
}
