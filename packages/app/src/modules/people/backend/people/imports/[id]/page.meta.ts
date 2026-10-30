export const metadata = {
  requireAuth: true,
  requireFeatures: ['people.manage', 'people.pesel.view'],
  pageTitle: 'Import',
  pageTitleKey: 'people.imports.record.pageTitle',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'People', labelKey: 'people.persons.title', href: '/backend/people/persons' },
    { label: 'Imports', labelKey: 'people.imports.title', href: '/backend/people/imports' },
    { label: 'Import', labelKey: 'people.imports.record.pageTitle' },
  ],
}
