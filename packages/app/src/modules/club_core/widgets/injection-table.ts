import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `club_core` injection table: the "Contract" row of the person record's "Staff setup" checklist (people life-cycle
 * spec REQ-L09, J-L07; #312), on the spot `vereino:people:person-record:staff-setup` that `people`'s Roles tab renders —
 * so `people` never imports `club_core`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:staff-setup': [{ widgetId: 'club_core.injection.staff-setup-contract', priority: 300 }],
}

export default injectionTable
