export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'Edit place',
  pageTitleKey: 'club_core.places.edit.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Places', labelKey: 'club_core.places.title', href: '/backend/club/places' },
    { label: 'Edit place', labelKey: 'club_core.places.edit.title' },
  ],
}
