export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'Edit external team',
  pageTitleKey: 'groups.externalTeams.edit.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'External teams', labelKey: 'groups.externalTeams.title', href: '/backend/groups/external-teams' },
    { label: 'Edit external team', labelKey: 'groups.externalTeams.edit.title' },
  ],
}
