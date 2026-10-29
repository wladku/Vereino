export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.view'],
  pageTitle: 'Session',
  pageTitleKey: 'activities.occurrences.record.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Sessions', labelKey: 'activities.occurrences.title', href: '/backend/activities/occurrences' },
    { label: 'Session', labelKey: 'activities.occurrences.record.title' },
  ],
}
