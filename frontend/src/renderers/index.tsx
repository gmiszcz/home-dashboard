import type { ComponentType } from 'react';

import type { RendererProps } from '../types';
import { AiRenderer } from './AiRenderer';
import { CalendarRenderer } from './CalendarRenderer';
import { EmailDigestRenderer } from './EmailDigestRenderer';
import { ExpensesRenderer } from './ExpensesRenderer';
import { FamilyEventsRenderer } from './FamilyEventsRenderer';
import { FinanceRenderer } from './FinanceRenderer';
import { GenericRenderer } from './GenericRenderer';
import { GithubRenderer } from './GithubRenderer';
import { InboxRenderer } from './InboxRenderer';
import { ParcelsRenderer } from './ParcelsRenderer';
import { PricesRenderer } from './PricesRenderer';
import { PromotionsRenderer } from './PromotionsRenderer';
import { SecurityAlertsRenderer } from './SecurityAlertsRenderer';
import { SubscriptionsRenderer } from './SubscriptionsRenderer';

const SPECIAL: Record<string, ComponentType<RendererProps>> = {
  calendar: CalendarRenderer,
  parcels: ParcelsRenderer,
  family_events: FamilyEventsRenderer,
  email_digest: EmailDigestRenderer,
  prices: PricesRenderer,
  promotions: PromotionsRenderer,
  subscriptions: SubscriptionsRenderer,
  expenses_weekly: ExpensesRenderer,
  finance: FinanceRenderer,
  ai_daily: AiRenderer,
  ai_weekly: AiRenderer,
  github_weekly: GithubRenderer,
  inbox_cleanup: InboxRenderer,
  security_alerts: SecurityAlertsRenderer,
};

export function SectionBody(props: RendererProps) {
  const Renderer = SPECIAL[props.update.section] ?? GenericRenderer;
  return <Renderer {...props} />;
}
