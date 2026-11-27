'use client'
// The image consent on B-10 (event photos spec UI table, REQ-I07, REQ-I08, J-I01 step 3; #871): staff never give it —
// the line "Only a guardian (or the adult themself) can give this consent" replaces the switch — but the club
// administrator records a withdrawal a guardian or the person asked for (on paper, by phone) with a required note
// (2–200 characters), and reads the history of decisions. The withdrawal goes through the same consents routes as
// before (`POST …/guardianships/{id}/consents` or `POST …/persons/{id}/consents`) with the record's lock token; 422 and
// 409 answers show in the dialog or as the platform conflict bar.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { CONSENT_NOTE_MAX, CONSENT_NOTE_MIN } from '../lib/image-consent'
import { errorMessage } from './client-helpers'

/** Where a staff withdrawal is recorded: a guardianship, or an adult's own consents. */
export type StaffImageTarget =
  | { kind: 'guardianship'; guardianshipId: string; lockToken: string | null }
  | { kind: 'own'; personId: string; lockToken: string | null }

type HistoryItem = {
  granted: boolean
  at: string
  byName: string | null
  byRole: 'guardian' | 'self' | 'club_admin' | 'system'
  currentWording: boolean
}

type History = { items: HistoryItem[]; earlier: { granted: boolean; at: string }[] }

function WithdrawDialog({
  target,
  onClose,
  onDone,
}: {
  target: StaffImageTarget
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [note, setNote] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const trimmed = note.trim()
  const ready = trimmed.length >= CONSENT_NOTE_MIN && trimmed.length <= CONSENT_NOTE_MAX
  const submit = async () => {
    setPending(true)
    setProblem(null)
    const url =
      target.kind === 'guardianship'
        ? `/api/people/guardianships/${encodeURIComponent(target.guardianshipId)}/consents`
        : `/api/people/persons/${encodeURIComponent(target.personId)}/consents`
    const body =
      target.kind === 'guardianship'
        ? { consents: { image: false }, note: trimmed }
        : { changes: { image: false }, note: trimmed }
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(target.lockToken), () =>
        apiCallOrThrow(
          url,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
          { errorMessage: t('people.consents.image.staff.errors.save') },
        ),
      )
      flash(t('people.consents.image.staff.flash.withdrawn'), 'success')
      await onDone()
      onClose()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) onClose()
      else setProblem(errorMessage(error, t('people.consents.image.staff.errors.save')))
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent closeAriaLabel={t('people.common.cancel')} data-testid="people-image-withdraw-dialog">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('people.consents.image.staff.withdraw.title')}</DialogTitle>
            <DialogDescription>{t('people.consents.image.staff.withdraw.help')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-image-withdraw-note">{t('people.consents.image.staff.withdraw.note')}</Label>
            <Textarea
              id="people-image-withdraw-note"
              value={note}
              maxLength={CONSENT_NOTE_MAX}
              disabled={pending}
              aria-describedby={problem ? 'people-image-withdraw-problem' : undefined}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
            <span className="text-muted-foreground text-xs">
              {t('people.consents.image.staff.withdraw.noteHint', {
                min: String(CONSENT_NOTE_MIN),
                max: String(CONSENT_NOTE_MAX),
              })}
            </span>
          </div>
          {problem ? (
            <p id="people-image-withdraw-problem" className="text-destructive text-sm" role="alert">
              {problem}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {t('people.common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive-solid"
              disabled={pending || !ready}
              data-testid="people-image-withdraw-submit"
            >
              {t('people.consents.image.staff.withdraw.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({ personId, onClose }: { personId: string; onClose: () => void }) {
  const t = useT()
  const history = useQuery({
    queryKey: ['people-image-history-staff', personId],
    queryFn: async (): Promise<History> => {
      const call = await apiCall<History>(
        `/api/people/persons/${encodeURIComponent(personId)}/consents/image-history?pageSize=100`,
      )
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
  const items = history.data?.items ?? []
  const earlier = history.data?.earlier ?? []
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent closeAriaLabel={t('people.common.cancel')} data-testid="people-image-history-dialog">
        <DialogHeader>
          <DialogTitle>{t('people.consents.image.staff.history.title')}</DialogTitle>
        </DialogHeader>
        {history.isLoading ? (
          <p className="text-muted-foreground text-sm">{t('people.consents.image.history.loading')}</p>
        ) : history.isError ? (
          <div className="flex items-center gap-2 text-sm" role="alert">
            <span>{t('people.consents.image.history.error')}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void history.refetch()}>
              {t('people.consents.image.history.retry')}
            </Button>
          </div>
        ) : items.length === 0 && earlier.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('people.consents.image.history.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {items.map((item) => (
              <li
                key={`${item.at}:${item.byRole}`}
                className="flex flex-wrap items-center gap-2"
                data-testid="people-image-history-item"
              >
                <StatusTag status={item.granted ? 'success' : 'neutral'}>
                  {t(
                    item.granted ? 'people.consents.image.history.given' : 'people.consents.image.history.withdrawn',
                  )}
                </StatusTag>
                <span>{item.byName ?? t(`people.consents.image.history.by.${item.byRole}`)}</span>
                <span className="text-muted-foreground">{item.at.slice(0, 16).replace('T', ' ')}</span>
                <span className="text-muted-foreground text-xs">
                  {t(
                    item.currentWording
                      ? 'people.consents.image.history.currentWording'
                      : 'people.consents.image.history.earlierWording',
                  )}
                </span>
              </li>
            ))}
            {earlier.map((entry) => (
              <li key={entry.at} className="text-muted-foreground text-xs">
                {t('people.consents.image.history.beforeHistory', { date: entry.at.slice(0, 10) })}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('people.consents.image.staff.history.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The image consent's staff controls: the "only a guardian gives it" line, **Record withdrawal** while the consent is
 * given (club administrator only), and **History**.
 */
export function ImageConsentStaff({
  subjectPersonId,
  granted,
  canManage,
  target,
  onChanged,
}: {
  subjectPersonId: string
  granted: boolean
  canManage: boolean
  target: StaffImageTarget
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const [dialog, setDialog] = React.useState<'withdraw' | 'history' | null>(null)
  return (
    <div className="flex flex-col gap-2" data-testid="people-image-consent-staff">
      <p className="text-muted-foreground max-w-prose text-xs">
        {t(target.kind === 'own' ? 'people.consents.image.staff.onlySelf' : 'people.consents.image.staff.onlyGuardian')}
      </p>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {granted ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="people-image-withdraw"
              onClick={() => {
                setDialog('withdraw')
              }}
            >
              {t('people.consents.image.staff.withdraw.action')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="people-image-history"
            onClick={() => {
              setDialog('history')
            }}
          >
            {t('people.consents.image.staff.history.action')}
          </Button>
        </div>
      ) : null}
      {dialog === 'withdraw' ? (
        <WithdrawDialog
          target={target}
          onClose={() => {
            setDialog(null)
          }}
          onDone={onChanged}
        />
      ) : null}
      {dialog === 'history' ? (
        <HistoryDialog
          personId={subjectPersonId}
          onClose={() => {
            setDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}
