export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication.post'],
  pageTitle: 'New announcement',
  pageTitleKey: 'communication.threads.create.title',
  pageGroup: 'Communication',
  pageGroupKey: 'communication.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Threads', labelKey: 'communication.threads.title', href: '/backend/communication/threads' },
    { label: 'New announcement', labelKey: 'communication.threads.create.title' },
  ],
}
