import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `groups` injection table: the person's membership history on the "Groups" tab of the person record, mounted on
 * the spot `vereino:people:person-record:groups` that `people`'s `PersonRecord` renders (#84, E06-S02), and the groups
 * and sections of a ward (or of the member) on the spot `vereino:club:ward:groups` that `people`'s `/club/profile`
 * and `/club/wards/[personId]` pages render (E06-S22 #104), and the "Groups as coach" row of the person record's
 * "Staff setup" checklist on the spot `vereino:people:person-record:staff-setup` (#312) — so `people` never imports
 * `groups`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:groups': [{ widgetId: 'groups.injection.person-groups', priority: 100 }],
  'vereino:club:ward:groups': [{ widgetId: 'groups.injection.club-ward-groups', priority: 100 }],
  // The "Groups as coach" row of the "Staff setup" checklist on the person record's Roles tab (REQ-L09, #312).
  'vereino:people:person-record:staff-setup': [{ widgetId: 'groups.injection.staff-setup-groups', priority: 200 }],
}

export default injectionTable
