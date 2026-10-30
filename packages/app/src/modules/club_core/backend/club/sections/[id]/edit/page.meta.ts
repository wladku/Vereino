export const metadata = {
  requireAuth: true,
  // Coordinators open it for the section's public page, logo and materials (#29); the core fields need club_core.manage.
  requireFeatures: ['club_core.view'],
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
