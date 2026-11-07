// `/backend/activities/reports/coach-units` (club spec UI table, REQ-008, REQ-021; README B-16; #96): the coach units
// report of the caller's sections. A coach reads their own row on the phone (`/club/coach/units`).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.reports.view'],
  pageTitle: 'Coach units report',
  pageTitleKey: 'activities.reports.coachUnits.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  pageOrder: 25,
  icon: 'calculator',
  breadcrumb: [{ label: 'Coach units report', labelKey: 'activities.reports.coachUnits.title' }],
}
