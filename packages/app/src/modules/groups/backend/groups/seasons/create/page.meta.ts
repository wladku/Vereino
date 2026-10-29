export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'New season',
  pageTitleKey: 'groups.seasons.create.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'Seasons', labelKey: 'groups.seasons.title', href: '/backend/groups/seasons' },
    { label: 'New season', labelKey: 'groups.seasons.create.title' },
  ],
}
