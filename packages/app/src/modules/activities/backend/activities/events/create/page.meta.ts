export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.events.create'],
  pageTitle: 'New one-off event',
  pageTitleKey: 'activities.events.create.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Activities', labelKey: 'activities.activities.title', href: '/backend/activities/activities' },
    { label: 'New one-off event', labelKey: 'activities.events.create.title' },
  ],
}
