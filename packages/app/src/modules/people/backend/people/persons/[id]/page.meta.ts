export const metadata = {
  requireAuth: true,
  requireFeatures: ['people.view'],
  pageTitle: 'Person record',
  pageTitleKey: 'people.persons.record.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'People', labelKey: 'people.persons.title', href: '/backend/people/persons' },
    { label: 'Person record', labelKey: 'people.persons.record.title' },
  ],
}
