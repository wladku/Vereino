// A tab of the groups list (club spec UI table: "tabs External teams and Seasons"): reached through the tabs on
// `/backend/groups/groups`, so it has no sidebar entry of its own.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.view'],
  pageTitle: 'External teams',
  pageTitleKey: 'groups.externalTeams.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'External teams', labelKey: 'groups.externalTeams.title' },
  ],
}
