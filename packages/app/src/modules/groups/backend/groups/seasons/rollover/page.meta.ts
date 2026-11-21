// "Start a new season" (people life-cycle spec REQ-L08, phase L9, #311): reached from the Seasons tab, so it has no
// sidebar entry of its own. A coordinator sees the groups of their sections only (the routes decide).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['groups.manage'],
  pageTitle: 'Start a new season',
  pageTitleKey: 'groups.rollover.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Groups', labelKey: 'groups.groups.title', href: '/backend/groups/groups' },
    { label: 'Seasons', labelKey: 'groups.seasons.title', href: '/backend/groups/seasons' },
    { label: 'Start a new season', labelKey: 'groups.rollover.title' },
  ],
}
