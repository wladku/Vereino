// `/backend/club/publication` — the club page publication settings (club spec UI table, REQ-025; #29).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage', 'club_core.publication.manage'],
  pageTitle: 'Club page publication',
  pageTitleKey: 'club_core.publication.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  pageOrder: 15,
  icon: 'globe',
  pageContext: 'settings' as const,
  breadcrumb: [{ label: 'Club page publication', labelKey: 'club_core.publication.title' }],
}
