export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.contracts.manage'],
  pageTitle: 'Edit contract',
  pageTitleKey: 'club_core.contracts.edit.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Contracts', labelKey: 'club_core.contracts.title', href: '/backend/club/contracts' },
    { label: 'Edit contract', labelKey: 'club_core.contracts.edit.title' },
  ],
}
