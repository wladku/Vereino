import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `payments` injection table (#111): the body of the "Payments" tile of the member "Today" page, mounted on the spot
 * `vereino:club:today:payments` that `people`'s `/club` page renders inside the tile, so `people` never imports
 * `payments`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:club:today:payments': [{ widgetId: 'payments.injection.club-today-payments', priority: 100 }],
}

export default injectionTable
