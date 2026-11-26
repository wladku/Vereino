import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `payments` injection table (#111): the body of the "Payments" tile of the member "Today" page, mounted on the spot
 * `vereino:club:today:payments` that `people`'s `/club` page renders inside the tile, so `people` never imports
 * `payments`; the coach's "My groups' payments" tile (#117), the confirmers' "Handovers to confirm" (D-042, #791) and the guardian's kit "Order" tile (#299, REQ-C11) on
 * the spot `vereino:club:today:more` (rows of Today's "Shortcuts" list under its three tiles, E20-S14 #493); and the "Charges" tab of the person record (#295, DD-C05) on the spot
 * `vereino:people:person-record:charges`; and the Bank statements and Order campaigns menu counts on the platform spot
 * `backend:nav:badges` (navigation spec REQ-N03, #260).
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:people:person-record:charges': [{ widgetId: 'payments.injection.person-charges', priority: 100 }],
  'vereino:club:today:payments': [{ widgetId: 'payments.injection.club-today-payments', priority: 100 }],
  'vereino:club:today:more': [
    { widgetId: 'payments.injection.club-today-order', priority: 90 },
    { widgetId: 'payments.injection.club-today-cash-handovers', priority: 85 },
    { widgetId: 'payments.injection.club-coach-payments', priority: 80 },
  ],
  'backend:nav:badges': [{ widgetId: 'payments.injection.nav-badges', priority: 100 }],
}

export default injectionTable
