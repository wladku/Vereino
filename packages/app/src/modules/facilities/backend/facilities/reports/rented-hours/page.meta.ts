// `/backend/facilities/reports/rented-hours` (facilities spec REQ-038, the rented-hours row of *UI*; #129).
// The "Rented hours" tab of B-28 "Municipality report" (navigation spec REQ-N02; #256): reached through the tabs on
// `/backend/facilities/reports/owner`, so it has no sidebar entry of its own; the title and breadcrumb name the page.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.reports.view'],
  pageTitle: 'Municipality report',
  pageTitleKey: 'facilities.reports.owner.title',
  pageGroup: 'Facility',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 71,
  icon: 'clock',
  navHidden: true,
  breadcrumb: [
    {
      label: 'Municipality report',
      labelKey: 'facilities.reports.owner.title',
      href: '/backend/facilities/reports/owner',
    },
  ],
}
