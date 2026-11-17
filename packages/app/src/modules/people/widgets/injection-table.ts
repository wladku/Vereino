import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `people` injection table (people life-cycle spec REQ-L13; #305): the "First administrator" banner on top of every
 * backend page while the club has no administrator, for a user with `auth.users.create`.
 */
export const injectionTable: ModuleInjectionTable = {
  'backend:layout:top': [{ widgetId: 'people.injection.first-administrator-banner', priority: 100 }],
}

export default injectionTable
