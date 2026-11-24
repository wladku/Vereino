// `GET /api/activities/reports/pzpn-attendance` (training outlines spec REQ-O10, DD-O09, M-O9; #684): a team's
// attendance of a period as PZPN's "Lista obecności" CSV. Access and the file format: `../../pzpn-export-shared.ts`.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pzpnAttendanceHeaders } from '../../../lib/pzpn-export'
import { readPzpnAttendance } from '../../../services/pzpn-export'
import { pzpnExportDoc, pzpnExportHandler } from '../../pzpn-export-shared'

export const metadata = {
  GET: { requireAuth: true },
}

export const GET = pzpnExportHandler('attendance', readPzpnAttendance, pzpnAttendanceHeaders)

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'PZPN attendance export',
  methods: {
    GET: pzpnExportDoc(
      'A team’s attendance for a period as a PZPN CSV file',
      'One row per session × player for every session of `groupId` from `from` to `to` that was not cancelled — the group’s participants on the session’s date and anyone with an attendance row — by start, then last and first name: team, date, start, last name, first name, birth date, status. The status is Obecny (present or late), Usprawiedliwiony (absent after a final “no” declared before the start), Nieobecny (any other absence) or empty (not marked); it is always Polish.',
    ),
  },
}
