// `/backend/activities/policies` (club spec UI table, REQ-007; #32): the declaration policies — who declares for a
// minor. What is declared per activity type is the club setting on `/backend/club/settings` (D-026).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.view'],
  pageTitle: 'Declaration policies',
  pageTitleKey: 'activities.policies.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  pageOrder: 30,
  icon: 'shield-check',
  breadcrumb: [{ label: 'Declaration policies', labelKey: 'activities.policies.title' }],
}
