import { Message } from 'primereact/message';

import type { ConnectionMode, SectionUpdate } from '../types';
import { SectionCard } from './SectionCard';

export function SectionGrid({
  sections,
  now,
  staleMinutes,
  unauthorized,
  mode,
}: {
  sections: SectionUpdate[];
  now: Date;
  staleMinutes: number;
  unauthorized: boolean;
  mode: ConnectionMode;
}) {
  if (unauthorized) {
    return (
      <Message
        severity="warn"
        className="banner"
        text="Odczyt jest chroniony tokenem. Otwórz pulpit z parametrem ?token= w adresie — zostanie zapisany na tym iPadzie."
      />
    );
  }
  if (sections.length === 0 && mode === 'connecting') {
    return <Message severity="info" className="banner" text="Łączenie z pulpitem…" />;
  }
  if (sections.length === 0 && mode === 'offline') {
    return (
      <Message
        severity="error"
        className="banner"
        text="Brak połączenia z serwerem. Pulpit spróbuje ponownie."
      />
    );
  }
  if (sections.length === 0) {
    return (
      <Message
        severity="info"
        className="banner"
        text="Brak podsumowań. Ryuk jeszcze nic nie wysłał na ten pulpit."
      />
    );
  }
  return (
    <div className="board">
      {sections.map((update) => (
        <SectionCard key={update.section} update={update} now={now} staleMinutes={staleMinutes} />
      ))}
    </div>
  );
}
