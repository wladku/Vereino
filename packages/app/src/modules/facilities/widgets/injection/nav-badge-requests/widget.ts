import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import RequestsNavBadgeWidget from './widget.client'

/**
 * The count on the Requests menu item (navigation spec REQ-N03; #260): the online rental requests awaiting approval,
 * on the platform spot `backend:nav:badges`. Headless; mounted with the features the queue route requires.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'facilities.injection.nav-badge-requests',
    title: 'Menu count: requests awaiting approval',
    description: 'Publishes the number of rental requests awaiting approval on the Requests menu item.',
    features: ['facilities.view', 'facilities.rentals.approve'],
    priority: 100,
    enabled: true,
  },
  Widget: RequestsNavBadgeWidget,
}

export default widget
