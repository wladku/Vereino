// `GET /api/activities/reports/pzpn-schedule` (training outlines spec REQ-O10, DD-O06, M-O9; #684): a team's sessions
// of a period as PZPN's "Harmonogram treningowy" CSV. Access and the file format: `../../pzpn-export-shared.ts`.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pzpnScheduleHeaders } from '../../../lib/pzpn-export'
import { readPzpnSchedule } from '../../../services/pzpn-export'
import { pzpnExportDoc, pzpnExportHandler } from '../../pzpn-export-shared'

export const metadata = {
  GET: { requireAuth: true },
}

export const GET = pzpnExportHandler('schedule', readPzpnSchedule, pzpnScheduleHeaders)

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'PZPN schedule export',
  methods: {
    GET: pzpnExportDoc(
      'A team’s schedule for a period as a PZPN CSV file',
      'One row per session of `groupId` from `from` to `to`, cancelled ones included, by start: team, event type (Trening / Mecz / Turniej / Sparing / Obóz / Inne), date, start, end, place (the club place or the typed venue), name / general goal (the session’s outline topic when `training` provides one, else the activity name), coach, status (Zaplanowane / Odwołane). Event types and statuses are always Polish.',
    ),
  },
}
