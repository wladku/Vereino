export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'Club settings',
  pageTitleKey: 'club_core.settings.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  pageOrder: 10,
  icon: 'settings',
  pageContext: 'settings' as const,
  breadcrumb: [{ label: 'Club settings', labelKey: 'club_core.settings.title' }],
}
