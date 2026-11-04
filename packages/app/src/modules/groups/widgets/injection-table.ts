import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `groups` injection table (E06-S22 #104): the groups and sections of a ward (or of the member) on the spot
 * `vereino:club:ward:groups` that `people`'s `/club/profile` and `/club/wards/[personId]` pages render, so `people`
 * never imports `groups`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:club:ward:groups': [{ widgetId: 'groups.injection.club-ward-groups', priority: 100 }],
}

export default injectionTable
