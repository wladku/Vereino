// `/backend/training/outlines` (training outlines spec *UI architecture*, M-O5; #847): the administrator's list of the
// club's training outlines, an item of the Classes group after Sessions.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['training.manage'],
  pageTitle: 'Training outlines',
  pageTitleKey: 'training.list.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  pageOrder: 35,
  icon: 'clipboard-list',
  breadcrumb: [{ label: 'Training outlines', labelKey: 'training.list.title' }],
}
