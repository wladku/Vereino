// The Contracts tab of B-07 "Institutions and contracts" (navigation spec REQ-N02; #256): reached through the tabs on
// `/backend/club/institutions`, so it has no sidebar entry of its own; the title and breadcrumb name the page.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.contracts.manage'],
  pageTitle: 'Institutions and contracts',
  pageTitleKey: 'club_core.institutions.page.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  pageOrder: 40,
  icon: 'file-text',
  navHidden: true,
  breadcrumb: [
    {
      label: 'Institutions and contracts',
      labelKey: 'club_core.institutions.page.title',
      href: '/backend/club/institutions',
    },
  ],
}
