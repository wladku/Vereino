import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import StaffSetupContractWidget, { type StaffSetupContractContext } from './widget.client'

/**
 * The "Contract" row of the person record's "Staff setup" checklist (people life-cycle spec REQ-L09, J-L07; #312).
 * Contracts are the club administrator's (`club_core.contracts.manage`), so a coordinator does not see this row.
 */
const widget: InjectionWidgetModule<StaffSetupContractContext, Record<string, unknown>> = {
  metadata: {
    id: 'club_core.injection.staff-setup-contract',
    title: 'Person record: staff setup, contract',
    description: 'Whether the person has a coach contract, with a link to add or open it.',
    features: ['club_core.contracts.manage'],
    priority: 300,
    enabled: true,
  },
  Widget: StaffSetupContractWidget,
}

export default widget
