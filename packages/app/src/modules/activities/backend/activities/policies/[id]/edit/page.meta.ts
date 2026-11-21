export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.manage'],
  pageTitle: 'Edit declaration policy',
  pageTitleKey: 'activities.policies.edit.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Declaration policies', labelKey: 'activities.policies.title', href: '/backend/activities/policies' },
    { label: 'Edit declaration policy', labelKey: 'activities.policies.edit.title' },
  ],
}
