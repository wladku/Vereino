import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubTodayPaymentsWidget from './widget.client'

/**
 * The body of the "Payments" tile of `/club` (README M-02; issue #111 E07-S04) — what the payer owes and the nearest
 * due date, "Everything is paid" or "The guardian pays" — on the spot `vereino:club:today:payments` that `people`'s
 * Today page renders inside the tile, so `people` never imports `payments`.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.club-today-payments',
    title: 'Today: payments',
    description: 'The open total and the nearest due date of the payer’s charges.',
    features: ['payments.view_own'],
    priority: 100,
    enabled: true,
  },
  Widget: ClubTodayPaymentsWidget,
}

export default widget
