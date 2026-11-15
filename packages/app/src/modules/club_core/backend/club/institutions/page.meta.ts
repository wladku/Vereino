// B-07 "Institutions and contracts" (navigation spec REQ-N02; #256): the menu item of the page, its first tab.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'Institutions and contracts',
  pageTitleKey: 'club_core.institutions.page.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  pageOrder: 30,
  icon: 'building',
  breadcrumb: [{ label: 'Institutions and contracts', labelKey: 'club_core.institutions.page.title' }],
}
