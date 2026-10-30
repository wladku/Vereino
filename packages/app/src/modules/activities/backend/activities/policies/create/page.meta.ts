export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.manage'],
  pageTitle: 'New declaration policy',
  pageTitleKey: 'activities.policies.create.title',
  pageGroup: 'Schedule',
  pageGroupKey: 'activities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Declaration policies', labelKey: 'activities.policies.title', href: '/backend/activities/policies' },
    { label: 'New declaration policy', labelKey: 'activities.policies.create.title' },
  ],
}
