import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `enrolment` injection table (sign-up form spec P-J1, M-J1; #799): the "Apply" button on `club_core`'s public section
 * page (spot `vereino:public:section:actions`, rendered in the header and after the classes) and the applications tile
 * of `people`'s member "Today" page, so neither module imports `enrolment`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:public:section:actions': [{ widgetId: 'enrolment.injection.section-apply', priority: 100 }],
  'vereino:club:today:sections': [{ widgetId: 'enrolment.injection.club-today', priority: 95 }],
}

export default injectionTable
