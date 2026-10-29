import { Badge } from 'primereact/badge';
import { Card } from 'primereact/card';
import { Tag } from 'primereact/tag';

import { formatDateTime, formatRelative, isStale } from '../format';
import { SectionBody } from '../renderers';
import { sectionMeta } from '../sections';
import type { SectionUpdate } from '../types';

export function SectionCard({
  update,
  now,
  staleMinutes,
}: {
  update: SectionUpdate;
  now: Date;
  staleMinutes: number;
}) {
  const meta = sectionMeta(update.section);
  const stale = isStale(update.generated_at, now, staleMinutes);
  const title = update.title?.trim() || meta.title;
  return (
    <Card className={`section-card${meta.wide ? ' span-2' : ''}${stale ? ' is-stale' : ''}`}>
      <div className="card-head">
        <div>
          <p className="eyebrow">
            <i className={meta.icon} aria-hidden="true" /> {meta.title}
          </p>
          <h2>{title}</h2>
        </div>
        <div className="card-meta">
          {update.items.length > 0 ? <Badge value={update.items.length} /> : null}
          <span className="ago">{formatRelative(update.generated_at, now)}</span>
          <span className="stamp">{formatDateTime(update.generated_at)}</span>
          {stale ? <Tag value="nieaktualne" severity="warning" rounded /> : null}
        </div>
      </div>
      {update.summary ? <p className="summary">{update.summary}</p> : null}
      <SectionBody update={update} now={now} />
    </Card>
  );
}
