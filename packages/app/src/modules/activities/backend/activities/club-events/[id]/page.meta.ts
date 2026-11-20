export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.view'],
  pageTitle: 'Club event',
  pageTitleKey: 'activities.clubEvents.record.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Club events', labelKey: 'activities.clubEvents.title', href: '/backend/activities/club-events' },
    { label: 'Club event', labelKey: 'activities.clubEvents.record.title' },
  ],
}
