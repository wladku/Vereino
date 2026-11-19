import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import SessionsNavBadgeWidget from './widget.client'

/**
 * The count on the Sessions menu item (navigation spec REQ-N03, A-N14; #260): planned sessions without a coach from
 * today for 14 days in the caller's record scope — the B-15 tab "Needing a coach" — on the platform spot
 * `backend:nav:badges`. Headless; mounted only with `activities.view`, which the list route requires.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'activities.injection.nav-badge-sessions',
    title: 'Menu count: sessions needing a coach',
    description: 'Publishes the number of planned sessions without a coach on the Sessions menu item.',
    features: ['activities.view'],
    priority: 100,
    enabled: true,
  },
  Widget: SessionsNavBadgeWidget,
}

export default widget
