export const metadata = {
  requireAuth: true,
  requireFeatures: ['people.manage'],
  pageTitle: 'Add a person',
  pageTitleKey: 'people.persons.create.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'People', labelKey: 'people.persons.title', href: '/backend/people/persons' },
    { label: 'Add a person', labelKey: 'people.persons.create.title' },
  ],
}
