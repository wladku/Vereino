import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `activities` injection table (#32): the calendar and attendance tiles of the member "Today" page, mounted on the
 * spot `vereino:club:today:sections` that `people`'s `/club` page renders, so `people` never imports `activities`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:club:today:sections': [{ widgetId: 'activities.injection.club-today', priority: 100 }],
}

export default injectionTable
