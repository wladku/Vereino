import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubCoachPaymentsWidget from './widget.client'

/**
 * The "My groups' payments" tile of `/club` (README M-02 → M-18; payments spec REQ-033; issue #117 E07-S10): how many
 * children of the coach's first group have something to pay, how many are overdue and the cash the coach holds, as a
 * link to `/club/coach/payments`, on the spot `vereino:club:today:sections` of `people`'s Today page.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.club-coach-payments',
    title: "Today: my groups' payments",
    description: 'Children of my groups with charges to pay and the cash I hold.',
    features: ['payments.groups.view'],
    priority: 80,
    enabled: true,
  },
  Widget: ClubCoachPaymentsWidget,
}

export default widget
