export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.manage'],
  pageTitle: 'New activity',
  pageTitleKey: 'activities.activities.create.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Activities', labelKey: 'activities.activities.title', href: '/backend/activities/activities' },
    { label: 'New activity', labelKey: 'activities.activities.create.title' },
  ],
}
