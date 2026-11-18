'use client'
// The coach picker's state and save (README B-15, flow F-03 path A; E06-S13 #95), shared by the panel's
// `AssignCoachDialog` and the phone's `AssignCoachSheet` (E10-S08 #273, REQ-A10): the coaches of the club for a planned
// session (without the current one), the free ones first, narrowed by a search; a coach with an overlapping session
// is disabled with "Busy: {session}". The save sends the session's lock token; a stale token surfaces the conflict, a
// coach who became busy meanwhile (409 `occurrence_coach_conflict`) reloads the list with the message, and a session
// that was cancelled or closed meanwhile closes the picker and refreshes the caller.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { pickerOptions, type SubstituteOption } from '../lib/substitutions'
import { OWN_FORBIDDEN_STATE, errorMessage } from './client-helpers'

export type StaffableOccurrence = {
  id: string
  activityName?: string | null
  startAt: string | null
  coachPersonId: string | null
  updatedAt: string | null
}

type SubstituteOptions = { currentCoachPersonId: string | null; items: SubstituteOption[] }

export function useAssignCoach({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: StaffableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [coachId, setCoachId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const options = useQuery({
    queryKey: ['activities-occurrence-coach-options', occurrence.id],
    queryFn: () =>
      readApiResultOrThrow<SubstituteOptions>(
        `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/coach`,
        OWN_FORBIDDEN_STATE,
      ),
    enabled: open,
    retry: false,
  })
  const all = React.useMemo(() => options.data?.items ?? [], [options.data])
  const items = React.useMemo(() => pickerOptions(all, search), [all, search])

  const close = (next: boolean) => {
    // A picker opened again starts empty, without the previous attempt's choice or message.
    if (!next) {
      setCoachId('')
      setReason('')
      setSearch('')
      setProblem(null)
    }
    onOpenChange(next)
  }

  const choose = (next: string) => {
    setCoachId(next)
    setProblem(null)
  }

  const submit = async () => {
    if (!coachId) {
      setProblem(t('activities.substitutions.chooseCoach'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/coach`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ coachPersonId: coachId, reason: reason.trim() || null }),
          },
          { errorMessage: t('activities.substitutions.errors.assign') },
        ),
      )
      const name = all.find((item) => item.id === coachId)?.name ?? ''
      flash(t('activities.substitutions.assigned', { name }), 'success')
      close(false)
      await onDone()
    } catch (error: unknown) {
      const code = errorCodeOf(error)
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        close(false)
      } else if (code === 'occurrence_not_planned') {
        flash(errorMessage(error, t('activities.substitutions.errors.assign')), 'error')
        close(false)
        await onDone()
      } else {
        // A coach who became busy meanwhile: the list shows it disabled now.
        if (code === 'occurrence_coach_conflict') {
          setCoachId('')
          void options.refetch()
        }
        setProblem(errorMessage(error, t('activities.substitutions.errors.assign')))
      }
    } finally {
      setPending(false)
    }
  }

  return { options, items, coachId, choose, reason, setReason, search, setSearch, pending, problem, close, submit }
}
