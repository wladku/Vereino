// B-18 "Threads and cases" (navigation spec REQ-N02; #256): the menu item of the page, its first tab "All".
export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication.post'],
  pageTitle: 'Threads and cases',
  pageTitleKey: 'communication.threads.page.title',
  pageGroup: 'Messages',
  pageGroupKey: 'communication.nav.group',
  pageOrder: 10,
  icon: 'messages-square',
  breadcrumb: [{ label: 'Threads and cases', labelKey: 'communication.threads.page.title' }],
}
