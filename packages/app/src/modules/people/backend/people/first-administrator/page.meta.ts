// People life-cycle spec REQ-L13 (#305): reached from the "First administrator" banner, not from the sidebar
// (`navHidden`); gated by the platform feature that creates users (V-L04: the platform `admin` role holds `auth.*`).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['auth.users.create'],
  pageTitle: 'First administrator',
  pageTitleKey: 'people.firstAdministrator.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  navHidden: true,
  breadcrumb: [{ label: 'First administrator', labelKey: 'people.firstAdministrator.title' }],
}
