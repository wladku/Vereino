export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.contracts.manage'],
  pageTitle: 'New contract',
  pageTitleKey: 'club_core.contracts.create.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Contracts', labelKey: 'club_core.contracts.title', href: '/backend/club/contracts' },
    { label: 'New contract', labelKey: 'club_core.contracts.create.title' },
  ],
}
