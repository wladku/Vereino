export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'Edit section',
  pageTitleKey: 'club_core.sections.edit.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Sections', labelKey: 'club_core.sections.title', href: '/backend/club/sections' },
    { label: 'Edit section', labelKey: 'club_core.sections.edit.title' },
  ],
}
