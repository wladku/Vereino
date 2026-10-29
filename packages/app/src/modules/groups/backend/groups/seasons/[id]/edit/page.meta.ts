export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'Edit season',
  pageTitleKey: 'groups.seasons.edit.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'Seasons', labelKey: 'groups.seasons.title', href: '/backend/groups/seasons' },
    { label: 'Edit season', labelKey: 'groups.seasons.edit.title' },
  ],
}
