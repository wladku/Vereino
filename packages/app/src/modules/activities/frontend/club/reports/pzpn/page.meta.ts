import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/reports/pzpn` — the PZPN exports (training outlines spec M-O9, #684): a team's schedule and attendance as CSV.
 * Every role that may export reads groups (`groups.view`); the routes decide which teams (`activities.reports.view` or
 * `view_own` with the group in the caller's scope).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['groups.view'],
  title: 'PZPN exports',
  titleKey: 'activities.club.pzpn.title',
}

export default metadata
