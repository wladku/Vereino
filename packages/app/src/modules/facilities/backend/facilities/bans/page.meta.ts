// `/backend/facilities/bans` (facilities spec B-27; #126).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.incidents.manage'],
  pageTitle: 'Entry bans',
  pageTitleKey: 'facilities.records.bans.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 60,
  icon: 'ban',
  breadcrumb: [{ label: 'Entry bans', labelKey: 'facilities.records.bans.title' }],
}
