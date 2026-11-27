// `/backend/training/outlines/[id]` (training outlines spec *UI architecture*, M-O5; #847): one outline in the back
// office.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['training.manage'],
  pageTitle: 'Training outline',
  pageTitleKey: 'training.editor.title',
  pageGroup: 'Classes',
  pageGroupKey: 'groups.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Training outlines', labelKey: 'training.list.title', href: '/backend/training/outlines' },
    { label: 'Training outline', labelKey: 'training.editor.title' },
  ],
}
