export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'New institution',
  pageTitleKey: 'club_core.institutions.create.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Institutions', labelKey: 'club_core.institutions.title', href: '/backend/club/institutions' },
    { label: 'New institution', labelKey: 'club_core.institutions.create.title' },
  ],
}
