import type { ComponentType } from 'react';

import type { RendererProps } from '../types';
import { AiRenderer } from './AiRenderer';
import { CalendarRenderer } from './CalendarRenderer';
import { EmailDigestRenderer } from './EmailDigestRenderer';
import { GenericRenderer } from './GenericRenderer';
import { GithubRenderer } from './GithubRenderer';
import { InboxRenderer } from './InboxRenderer';
import { MoneyRenderer } from './MoneyRenderer';
import { ParcelsRenderer } from './ParcelsRenderer';
import { PricesRenderer } from './PricesRenderer';
import { PromotionsRenderer } from './PromotionsRenderer';

const SPECIAL: Record<string, ComponentType<RendererProps>> = {
  calendar: CalendarRenderer,
  parcels: ParcelsRenderer,
  email_digest: EmailDigestRenderer,
  prices: PricesRenderer,
  promotions: PromotionsRenderer,
  subscriptions: MoneyRenderer,
  expenses_weekly: MoneyRenderer,
  finance: MoneyRenderer,
  ai_daily: AiRenderer,
  ai_weekly: AiRenderer,
  github_weekly: GithubRenderer,
  inbox_cleanup: InboxRenderer,
};

export function SectionBody(props: RendererProps) {
  const Renderer = SPECIAL[props.update.section] ?? GenericRenderer;
  return <Renderer {...props} />;
}
