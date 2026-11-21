export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'New group',
  pageTitleKey: 'groups.groups.create.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'New group', labelKey: 'groups.groups.create.title' },
  ],
}
