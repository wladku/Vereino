// The "Cases" tab of B-18 "Threads and cases" (navigation spec REQ-N02; #256): reached through the tabs on
// `/backend/communication/threads`, so it has no sidebar entry of its own; the title and breadcrumb name the page.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication.cases.manage'],
  pageTitle: 'Threads and cases',
  pageTitleKey: 'communication.threads.page.title',
  pageGroup: 'Communication',
  pageGroupKey: 'communication.nav.group',
  pageOrder: 20,
  icon: 'archive',
  navHidden: true,
  breadcrumb: [
    {
      label: 'Threads and cases',
      labelKey: 'communication.threads.page.title',
      href: '/backend/communication/threads',
    },
  ],
}
