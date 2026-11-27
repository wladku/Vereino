// `/backend/enterprise-demo` (enterprise package spec *UI and Interaction Contracts*): the demo page exists to be
// tested, not used. The ACL decides who sees it; the page itself asks the licence state and shows nothing when `off`.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['enterprise_demo.view'],
  pageTitle: 'Enterprise demo',
  pageTitleKey: 'enterprise_demo.page.title',
  pageOrder: 900,
  icon: 'sparkles',
  navHidden: true,
}
