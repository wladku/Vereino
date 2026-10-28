export const metadata = {
  requireAuth: true,
  requireFeatures: ['club_core.manage'],
  pageTitle: 'New section',
  pageTitleKey: 'club_core.sections.create.title',
  pageGroup: 'Club',
  pageGroupKey: 'club_core.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Sections', labelKey: 'club_core.sections.title', href: '/backend/club/sections' },
    { label: 'New section', labelKey: 'club_core.sections.create.title' },
  ],
}
