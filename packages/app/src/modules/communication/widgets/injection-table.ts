import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `communication` injection table (#35): the "Messages" tile of the member "Today" page, mounted on the spot
 * `vereino:club:today:sections` that `people`'s `/club` page renders, so `people` never imports `communication`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:club:today:sections': [{ widgetId: 'communication.injection.club-messages', priority: 90 }],
}

export default injectionTable
