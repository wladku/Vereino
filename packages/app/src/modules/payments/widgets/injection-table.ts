import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `payments` injection table (#111): the body of the "Payments" tile of the member "Today" page, mounted on the spot
 * `vereino:club:today:payments` that `people`'s `/club` page renders inside the tile, so `people` never imports
 * `payments`; the coach's "My groups' payments" tile (#117) and the guardian's kit "Order" tile (#299, REQ-C11) on
 * the spot `vereino:club:today:sections`; and the "Charges" tab of the person record (#295, DD-C05) on the spot
 * `vereino:people:person-record:charges`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:charges': [{ widgetId: 'payments.injection.person-charges', priority: 100 }],
  'vereino:club:today:payments': [{ widgetId: 'payments.injection.club-today-payments', priority: 100 }],
  'vereino:club:today:sections': [
    { widgetId: 'payments.injection.club-today-order', priority: 90 },
    { widgetId: 'payments.injection.club-coach-payments', priority: 80 },
  ],
}

export default injectionTable
