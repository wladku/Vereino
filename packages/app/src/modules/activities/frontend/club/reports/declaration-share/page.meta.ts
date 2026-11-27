import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/reports/declaration-share` — "Declarations in Vereino" on the phone (product brief Goals, D21, D29; E27-S02,
 * #819): a section coordinator's own sections, the administrator every section, with the numbers of the panel report.
 * The page itself asks only for a signed-in user: its read (`GET /api/activities/reports/declaration-share`) requires
 * `activities.reports.view` with the record scope, and a 403 shows the page's own refusal, which names who sees the
 * report, instead of the platform's bare "Access denied" (E20-S10, #489).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  title: 'Declarations in Vereino',
  titleKey: 'activities.reports.declarationShare.title',
}

export default metadata
