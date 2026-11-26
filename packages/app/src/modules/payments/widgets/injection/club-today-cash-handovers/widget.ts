import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubTodayCashHandoversWidget from './widget.client'

/**
 * The "Handovers to confirm" row of `/club` — Today (payments spec REQ-033a, M-18a; D-042, #791): how many cash
 * handovers wait for the treasurer or the administrator and their total, as a link to `/club/cash-handovers`, on the
 * spot `vereino:club:today:more` of `people`'s Today page (a row of the Shortcuts list, #493).
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.club-today-cash-handovers',
    title: 'Today: handovers to confirm',
    description: 'Cash handovers the collectors sent, waiting for confirmation.',
    features: ['payments.cash.settle'],
    priority: 85,
    enabled: true,
  },
  Widget: ClubTodayCashHandoversWidget,
}

export default widget
