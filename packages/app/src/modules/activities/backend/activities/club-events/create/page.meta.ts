export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.manage'],
  pageTitle: 'New club event',
  pageTitleKey: 'activities.clubEvents.create.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Club events', labelKey: 'activities.clubEvents.title', href: '/backend/activities/club-events' },
    { label: 'New club event', labelKey: 'activities.clubEvents.create.title' },
  ],
}
