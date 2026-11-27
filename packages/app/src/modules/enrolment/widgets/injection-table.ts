import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

/**
 * `enrolment` injection table (sign-up form spec P-J1, M-J1; #799): the "Apply" button on `club_core`'s public section
 * page (spot `vereino:public:section:actions`, rendered in the header and after the classes) and the applications tile
 * of `people`'s member "Today" page, and the group sign-up QR code on `groups`' group page `/club/groups/[id]` (spot
 * `vereino:club:group:actions`, #869), so none of these modules imports `enrolment`.
 */
export const injectionTable: ModuleInjectionTable = {
  'vereino:public:section:actions': [{ widgetId: 'enrolment.injection.section-apply', priority: 100 }],
  'vereino:club:today:sections': [{ widgetId: 'enrolment.injection.club-today', priority: 95 }],
  'vereino:club:group:actions': [{ widgetId: 'enrolment.injection.group-sign-up-code', priority: 100 }],
}

export default injectionTable
