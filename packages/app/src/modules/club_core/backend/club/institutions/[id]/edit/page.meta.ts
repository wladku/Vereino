export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'Edit institution',
  pageTitleKey: 'club_core.institutions.edit.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Institutions', labelKey: 'club_core.institutions.title', href: '/backend/club/institutions' },
    { label: 'Edit institution', labelKey: 'club_core.institutions.edit.title' },
  ],
}
