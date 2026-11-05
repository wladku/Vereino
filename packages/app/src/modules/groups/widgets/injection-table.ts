import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `groups` injection table (#84, E06-S02): the person's membership history on the "Groups" tab of the person record,
 * mounted on the spot `vereino:people:person-record:groups` that `people`'s `PersonRecord` renders, so `people` never
 * imports `groups`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:groups': [{ widgetId: 'groups.injection.person-groups', priority: 100 }],
}

export default injectionTable
