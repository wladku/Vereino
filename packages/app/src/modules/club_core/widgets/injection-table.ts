import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `club_core` injection table: the "Contract" row of the person record's "Staff setup" checklist (people life-cycle
 * spec REQ-L09, J-L07; #312), on the spot `vereino:people:person-record:staff-setup` that `people`'s Roles tab renders —
 * so `people` never imports `club_core`; and the "Add place" dialog of `activities`' club event form (club events spec
 * REQ-T06, B-T2; #378) on the spot `vereino:activities:club-event-form:add-place`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:staff-setup': [{ widgetId: 'club_core.injection.staff-setup-contract', priority: 300 }],
  'vereino:activities:club-event-form:add-place': [
    { widgetId: 'club_core.injection.add-external-place', priority: 100 },
  ],
}

export default injectionTable
