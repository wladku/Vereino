import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import PaymentsNavBadgesWidget from './widget.client'

/**
 * The counts on the Bank statements and Order campaigns menu items (navigation spec REQ-N03; payments parity spec
 * REQ-C09; #260) on the platform spot `backend:nav:badges`: one read of `GET /api/payments/dashboard?only=counts`,
 * which answers each count only under its own feature. Headless; mounted with `payments.view`, which the route
 * requires.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.nav-badges',
    title: 'Menu counts: bank statements and order campaigns',
    description: 'Publishes the transfers to decide and the running order campaigns on their menu items.',
    features: ['payments.view'],
    priority: 100,
    enabled: true,
  },
  Widget: PaymentsNavBadgesWidget,
}

export default widget
