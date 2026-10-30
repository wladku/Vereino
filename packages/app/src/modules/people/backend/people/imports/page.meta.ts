export const metadata = {
  requireAuth: true,
  requireFeatures: ['people.manage', 'people.pesel.view'],
  pageTitle: 'Imports',
  pageTitleKey: 'people.imports.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  pageOrder: 20,
  icon: 'upload',
  breadcrumb: [
    { label: 'People', labelKey: 'people.persons.title', href: '/backend/people/persons' },
    { label: 'Imports', labelKey: 'people.imports.title' },
  ],
}
