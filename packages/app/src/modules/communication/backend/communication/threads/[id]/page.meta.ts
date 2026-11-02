export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication.post'],
  pageTitle: 'Thread',
  pageTitleKey: 'communication.threads.record.title',
  pageGroup: 'Messages',
  pageGroupKey: 'communication.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Threads', labelKey: 'communication.threads.title', href: '/backend/communication/threads' },
    { label: 'Thread', labelKey: 'communication.threads.record.title' },
  ],
}
