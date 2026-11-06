// `/backend/facilities/calendar` (facilities spec B-23, REQ-029; #121).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Facility calendar',
  pageTitleKey: 'facilities.calendar.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 10,
  icon: 'calendar-clock',
  breadcrumb: [{ label: 'Facility calendar', labelKey: 'facilities.calendar.title' }],
}
