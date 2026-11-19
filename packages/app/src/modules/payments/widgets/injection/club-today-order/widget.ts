import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubTodayOrderWidget from './widget.client'

/**
 * The "Order" tile of `/club` (README M-02 → M-17; payments parity spec REQ-C11; issue #299 E12-S09): for each kit
 * order campaign that still takes orders and covers the caller's children, its name, the orders deadline and each
 * child's state, as a link to `/club/orders/{id}`, on the spot `vereino:club:today:sections` of `people`'s Today page.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.club-today-order',
    title: 'Today: kit order',
    description: 'Open kit order campaigns for my children and what each child ordered.',
    features: ['payments.orders.place'],
    priority: 90,
    enabled: true,
  },
  Widget: ClubTodayOrderWidget,
}

export default widget
