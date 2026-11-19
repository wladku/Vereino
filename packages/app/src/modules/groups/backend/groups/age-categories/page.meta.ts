// A tab of the groups list (people life-cycle spec REQ-L16, B-11 "Age categories" after Seasons; #384): reached through
// the tabs on `/backend/groups/groups`, so it has no sidebar entry of its own. Everyone who works with groups reads it;
// only the club administrator (`dictionaries.manage`) edits.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.view'],
  pageTitle: 'Age categories',
  pageTitleKey: 'groups.ageCategories.title',
  pageGroup: 'Groups',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'Age categories', labelKey: 'groups.ageCategories.title' },
  ],
}
