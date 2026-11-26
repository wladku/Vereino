// `/backend/activities/reports/declaration-share` (product brief Goals — the primary metric; D21; E27-S01, #818): per
// section, how many attendance declarations came through Vereino in a chosen period. The club administrator reads
// every section, a coordinator their sections (`activities.reports.view` with the record scope).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['activities.reports.view'],
  pageTitle: 'Declarations in Vereino',
  pageTitleKey: 'activities.reports.declarationShare.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  pageOrder: 41,
  icon: 'file-bar-chart',
  breadcrumb: [{ label: 'Declarations in Vereino', labelKey: 'activities.reports.declarationShare.title' }],
}
