'use client'
// The match squad in the coach block of `/club/occurrences/[id]` (training outlines and medical expiry spec M-O3,
// REQ-O05, Q-O05; #682): for a match, a sparring or a tournament, the players expected to play — the session's people
// whose declaration is not "no", read from the attendance list the coach's M-05 page uses (one cache entry) — each with
// the medical certificate chip, and a warning naming the players without a valid certificate (red). Under Q-O05's
// default it only warns: nothing is blocked or disabled. The section stays hidden while the list or the statuses are
// loading, when either read fails, and for a reader without `people.medical.view`.
import * as React from 'react'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MedicalStatusTag, notValidPersonIds } from '@vereino/ui'
import { useAttendanceList, type AttendanceRow } from './club-client'
import { useMedicalLabels, useMedicalStatuses } from './useMedicalStatuses'

/** The activity types played as a match squad (M-O3). */
export const SQUAD_ACTIVITY_TYPES: ReadonlySet<string> = new Set(['match', 'sparring', 'tournament'])

const NO_ROWS: readonly AttendanceRow[] = []

function playerName(row: AttendanceRow, fallback: string): string {
  return [row.firstName, row.lastName].filter(Boolean).join(' ') || fallback
}

export function MatchSquad({ occurrenceId }: { occurrenceId: string }) {
  const t = useT()
  const { labels, formatDate } = useMedicalLabels()
  const list = useAttendanceList(occurrenceId)
  const rows = list.data?.status === 'ok' ? list.data.list.rows : NO_ROWS
  const squad = rows.filter((row) => row.declared !== 'no')
  const statuses = useMedicalStatuses(squad.map((row) => row.personId))
  const players = squad.filter((row) => statuses.has(row.personId))
  if (players.length === 0) return null

  const empty = t('activities.common.empty')
  const notValid = new Set(
    notValidPersonIds(
      players.map((row) => row.personId),
      statuses,
    ),
  )
  const notValidNames = players.filter((row) => notValid.has(row.personId)).map((row) => playerName(row, empty))
  return (
    <section
      aria-labelledby="club-session-squad-title"
      className="flex flex-col gap-2 border-t pt-3"
      data-testid="club-session-squad"
    >
      <h3 id="club-session-squad-title" className="font-semibold">
        {t('activities.club.medical.squad.title')}
      </h3>
      {notValidNames.length > 0 ? (
        <Alert
          style="light"
          status="warning"
          data-testid="club-session-medical-warning"
          data-count={notValidNames.length}
        >
          <p className="max-w-prose">
            {t('activities.club.medical.squad.warning', {
              count: notValidNames.length,
              names: notValidNames.join(', '),
            })}
          </p>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-2">
        {players.map((row) => {
          const item = statuses.get(row.personId)
          return (
            <li
              key={row.personId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2"
              data-testid="club-session-squad-player"
              data-person-id={row.personId}
            >
              <span className="min-w-0 break-words">{playerName(row, empty)}</span>
              {item ? (
                <MedicalStatusTag
                  item={item}
                  labels={labels}
                  formatDate={formatDate}
                  personId={row.personId}
                  data-testid="club-session-squad-medical"
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
