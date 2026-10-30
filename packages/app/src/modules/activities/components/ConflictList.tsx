'use client'
// The session conflicts a save was refused with (409 `occurrence_place_conflict` / `occurrence_coach_conflict`, club
// spec glossary *Session conflict*): per conflicting slot the kind (place over capacity or coach busy), the time and
// the sessions and blocks it collides with, each session linked to its page. Shown in the page, not only in a toast,
// so the planner can change the time, place or coach and save again.
import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  dateLabel,
  instantDate,
  occurrenceHref,
  timeRangeOfInstants,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'

/** "Activity name (17:00–18:30)" for each session of a conflict, for the compact preview cell. */
export function conflictNames(t: Translate, conflicts: readonly ScheduleConflict[]): string {
  const names = new Set<string>()
  for (const conflict of conflicts) {
    for (const session of conflict.sessions)
      names.add(session.activityName ?? t('activities.conflicts.unknownActivity'))
    for (const block of conflict.blocks) names.add(block.reason)
    if (conflict.sessions.length === 0 && conflict.blocks.length === 0) {
      names.add(t(`activities.conflicts.kind.${conflict.kind}`))
    }
  }
  return [...names].join(', ')
}

export function ConflictList({ conflicts, title }: { conflicts: readonly ScheduleConflict[]; title?: string }) {
  const t = useT()
  return (
    <Alert status="error" data-testid="activities-conflicts">
      <AlertTitle>{title ?? t('activities.conflicts.title')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{t('activities.conflicts.help')}</span>
        {conflicts.length === 0 ? <span>{t('activities.conflicts.noDetails')}</span> : null}
        <ul className="flex flex-col gap-2">
          {conflicts.map((conflict) => (
            <li key={`${conflict.kind}:${conflict.key}:${conflict.startAt}`} className="flex flex-col gap-1">
              <span className="font-medium break-words">
                {t(`activities.conflicts.kind.${conflict.kind}`)} · {dateLabel(t, instantDate(conflict.startAt))}{' '}
                {timeRangeOfInstants(conflict.startAt, conflict.endAt)}
              </span>
              {conflict.sessions.length > 0 || conflict.blocks.length > 0 ? (
                <ul className="flex flex-col gap-1 pl-4">
                  {conflict.sessions.map((session) => (
                    <li key={session.id} className="break-words">
                      <Link className="underline underline-offset-4" href={occurrenceHref(session.id)}>
                        {session.activityName ?? t('activities.conflicts.unknownActivity')}
                      </Link>{' '}
                      ({dateLabel(t, instantDate(session.startAt))}{' '}
                      {timeRangeOfInstants(session.startAt, session.endAt)})
                    </li>
                  ))}
                  {conflict.blocks.map((block) => (
                    <li key={block.id} className="break-words">
                      {t('activities.conflicts.block', {
                        reason: block.reason,
                        time: timeRangeOfInstants(block.startAt, block.endAt),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
