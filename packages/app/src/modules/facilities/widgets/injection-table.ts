import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `facilities` injection table (#260): the Requests menu count on the platform spot `backend:nav:badges` (navigation
 * spec REQ-N03).
 */
export const injectionTable: ModuleInjectionTable = {
  'backend:nav:badges': [{ widgetId: 'facilities.injection.nav-badge-requests', priority: 100 }],
}

export default injectionTable
