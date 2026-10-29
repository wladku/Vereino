export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.view'],
  pageTitle: 'Activity',
  pageTitleKey: 'activities.activities.record.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Activities', labelKey: 'activities.activities.title', href: '/backend/activities/activities' },
    { label: 'Activity', labelKey: 'activities.activities.record.title' },
  ],
}
