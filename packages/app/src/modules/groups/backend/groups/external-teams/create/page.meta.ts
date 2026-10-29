export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'New external team',
  pageTitleKey: 'groups.externalTeams.create.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'External teams', labelKey: 'groups.externalTeams.title', href: '/backend/groups/external-teams' },
    { label: 'New external team', labelKey: 'groups.externalTeams.create.title' },
  ],
}
