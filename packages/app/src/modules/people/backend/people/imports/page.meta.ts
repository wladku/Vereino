export const metadata = {
  requireAuth: true,
  requireFeatures: ['people.manage', 'people.pesel.view'],
  pageTitle: 'Imports',
  pageTitleKey: 'people.imports.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  pageOrder: 20,
  icon: 'upload',
  // Navigation spec (menu structure, A-N03; #262): no menu item — the "Import" button of the people list opens it.
  navHidden: true,
  breadcrumb: [
    { label: 'People', labelKey: 'people.persons.title', href: '/backend/people/persons' },
    { label: 'Imports', labelKey: 'people.imports.title' },
  ],
}
