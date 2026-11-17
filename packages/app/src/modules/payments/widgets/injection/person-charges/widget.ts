import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import PersonChargesWidget, { type PersonChargesContext } from './widget.client'

/**
 * The "Charges" tab of the person record (README B-10; payments parity spec REQ-C07, DD-C05; #295), on the spot
 * `vereino:people:person-record:charges` of `people`'s `PersonRecord`. Without `payments.view` (a coordinator) the
 * widget is not registered for the user, so the record shows no "Charges" tab.
 */
const widget: InjectionWidgetModule<PersonChargesContext, Record<string, unknown>> = {
  metadata: {
    id: 'payments.injection.person-charges',
    title: 'Person record: charges',
    description: 'The charges the person owes or pays, with "Add charge".',
    features: ['payments.view'],
    priority: 100,
    enabled: true,
  },
  Widget: PersonChargesWidget,
}

export default widget
