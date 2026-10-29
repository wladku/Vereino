export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.view'],
  pageTitle: 'Group',
  pageTitleKey: 'groups.groups.record.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'Group', labelKey: 'groups.groups.record.title' },
  ],
}
