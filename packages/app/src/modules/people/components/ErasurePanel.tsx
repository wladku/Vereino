'use client'
// Erasure and removal on the "Leaving" tab (people life-cycle spec B-10 `?tab=leaving`, REQ-L05, J-L04; phase L6,
// #308).
// - `AnonymiseAction`: on a former person, "Anonymise" (with `people.persons.anonymize`) opens a dialog that names the
//   recorded erasure request, says what is erased now and what on the hold date, and asks for the last name; a refusal
//   (409 `anonymize_blocked`) lists the reasons with a link to what resolves each, a wrong name (422) stays in the
//   dialog. Not undoable — the dialog says so.
// - `AnonymisedState`: after the erasure, the date and the retention hold (the name stays until that day).
// - `DeleteAction`: "Delete person" for a person created by mistake; 409 `person_in_use` lists the reasons and points
//   to "Leaving the club" instead. Undoable from the history of changes.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import type { PersonDetail, Translate } from './client-helpers'
import { StatusTag } from '@vereino/ui'

/** One reason of a 409 `anonymize_blocked` or `person_in_use` (`lib/erasure-rules.ts`). */
type Reason = { code: string; module?: string; recordId?: string; params?: Record<string, string | number | null> }

type ErasureRequestRow = {
  id: string
  requesterKind: 'self' | 'guardian' | 'club'
  requestedByName: string | null
  erasureRequested: boolean
  status: 'open' | 'done' | 'declined'
  createdAt: string
}

const PERSONS_HREF = '/backend/people/persons'
const CASH_CUSTODY_HREF = '/backend/payments/cash-custody'

function formatDay(day: string | null | undefined, locale: string): string {
  if (!day) return ''
  const [year, month, date] = day.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, date)),
  )
}

function reasonsOf(body: unknown): Reason[] {
  const reasons = (body as { reasons?: unknown } | null)?.reasons
  return Array.isArray(reasons) ? (reasons as Reason[]) : []
}

/** Where a reason is resolved: the charge, the cash to settle, the account tab. */
function reasonHref(personId: string, reason: Reason): string | null {
  if (reason.code === 'open_charges' && reason.recordId) return `/backend/payments/charges/${reason.recordId}`
  if (reason.code === 'cash_held') return CASH_CUSTODY_HREF
  if (reason.code === 'account_open' || reason.code === 'account') {
    return `${PERSONS_HREF}/${personId}?tab=account`
  }
  if (reason.code === 'active_guardianship' || reason.code === 'guardianships') {
    return `${PERSONS_HREF}/${personId}?tab=guardianship`
  }
  if (reason.code === 'role_assignments') return `${PERSONS_HREF}/${personId}?tab=roles`
  return null
}

function reasonText(reason: Reason, t: Translate): string {
  const params = { ...(reason.params ?? {}), module: reason.module ? t(`people.erasure.module.${reason.module}`) : '' }
  return t(`people.erasure.reason.${reason.code}`, params)
}

function ReasonList({ personId, reasons, title }: { personId: string; reasons: Reason[]; title: string }) {
  const t = useT()
  return (
    <Alert status="error" data-testid="people-erasure-reasons">
      <AlertDescription>
        <p className="font-medium">{title}</p>
        <ul className="mt-1 list-disc pl-5">
          {reasons.map((reason, index) => {
            const href = reasonHref(personId, reason)
            return (
              <li key={`${reason.code}-${reason.module ?? ''}-${String(index)}`} data-reason={reason.code}>
                {reasonText(reason, t)}
                {href ? (
                  <>
                    {' '}
                    <a className="underline" href={href}>
                      {t('people.erasure.reason.open')}
                    </a>
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

/** The anonymised state: when, and until when the name stays (shown to the administrator only). */
export function AnonymisedState({ person }: { person: PersonDetail }) {
  const t = useT()
  const locale = useLocale()
  return (
    <div className="flex flex-col gap-2" data-testid="people-erasure-anonymised">
      <div>
        <StatusTag status="neutral">
          {t('people.erasure.anonymisedOn', { date: formatDay(person.anonymizedAt, locale) })}
        </StatusTag>
      </div>
      <p className="text-sm" data-testid="people-erasure-hold">
        {person.erasureHoldUntil
          ? t('people.erasure.holdUntil', { date: formatDay(person.erasureHoldUntil, locale) })
          : t('people.erasure.nameErased')}
      </p>
    </div>
  )
}

/** "Anonymise" and its typed confirmation (J-L04 step 2). */
export function AnonymiseAction({ person, onDone }: { person: PersonDetail; onDone: () => Promise<void> }) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = React.useState(false)
  const [requestId, setRequestId] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [mismatch, setMismatch] = React.useState(false)
  const [reasons, setReasons] = React.useState<Reason[]>([])
  const requests = useQuery({
    queryKey: ['people-erasure-requests', person.id],
    enabled: open,
    queryFn: async () => {
      const data = await readApiResultOrThrow<{ items: ErasureRequestRow[] }>(
        `/api/people/departure-requests?subjectPersonId=${encodeURIComponent(person.id)}&pageSize=50`,
      )
      return (data.items ?? []).filter((row) => row.erasureRequested && row.status !== 'declined')
    },
  })
  const candidates = requests.data ?? []
  // The first recorded request is chosen until the administrator picks another.
  const chosenRequestId = requestId || candidates[0]?.id || ''

  const close = () => {
    setOpen(false)
    setLastName('')
    setMismatch(false)
    setReasons([])
  }

  const submit = async () => {
    if (busy || !lastName.trim()) return
    setBusy(true)
    setMismatch(false)
    setReasons([])
    try {
      const call = await apiCall<{ code?: string; reasons?: Reason[] }>(
        `/api/people/persons/${encodeURIComponent(person.id)}/anonymize`,
        {
          method: 'POST',
          // The person's version as the page loaded it: a change since answers 409 and the page reloads.
          headers: { 'content-type': 'application/json', ...buildOptimisticLockHeader(person.updatedAt) },
          // Without a recorded request the server answers 409 with `request_missing` among the reasons.
          body: JSON.stringify({ requestId: chosenRequestId || person.id, confirmLastName: lastName }),
        },
      )
      if (call.ok) {
        flash(t('people.erasure.flash.anonymised'), 'success')
        close()
        await onDone()
        return
      }
      const code = errorCodeOf(call.result)
      if (code === 'confirmation_mismatch') setMismatch(true)
      else if (code === 'anonymize_blocked') setReasons(reasonsOf(call.result))
      else if (call.status === 409) {
        flash(t('people.leaving.flash.stale'), 'warning')
        close()
        await onDone()
      } else flash(t('people.erasure.errors.anonymise'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => {
          setOpen(true)
        }}
        data-testid="people-erasure-anonymise"
      >
        {t('people.erasure.anonymise.action')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true)
          else close()
        }}
      >
        <DialogContent
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void submit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('people.erasure.anonymise.title')}</DialogTitle>
            <DialogDescription>{t('people.erasure.anonymise.irreversible')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            <p>{t('people.erasure.anonymise.now')}</p>
            <p>{t('people.erasure.anonymise.hold')}</p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="people-erasure-request">{t('people.erasure.anonymise.request')}</Label>
              {candidates.length > 0 ? (
                <Select value={chosenRequestId} onValueChange={setRequestId}>
                  <SelectTrigger id="people-erasure-request">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {t(`people.leaving.requests.kind.${row.requesterKind}`, {
                          name: row.requestedByName ?? '',
                          date: formatDay(row.createdAt, locale),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground" id="people-erasure-request">
                  {requests.isLoading ? t('people.leaving.requests.loading') : t('people.erasure.anonymise.noRequest')}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="people-erasure-last-name">{t('people.erasure.anonymise.lastName')}</Label>
              <Input
                id="people-erasure-last-name"
                value={lastName}
                autoComplete="off"
                aria-invalid={mismatch || undefined}
                aria-describedby={mismatch ? 'people-erasure-last-name-error' : undefined}
                onChange={(event) => {
                  setLastName(event.target.value)
                  setMismatch(false)
                }}
              />
              {mismatch ? (
                <p id="people-erasure-last-name-error" className="text-destructive text-xs" role="alert">
                  {t('people.errors.confirmation_mismatch')}
                </p>
              ) : null}
            </div>
            {reasons.length > 0 ? (
              <ReasonList personId={person.id} reasons={reasons} title={t('people.errors.anonymize_blocked')} />
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t('people.leaving.actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !lastName.trim()}
              onClick={() => void submit()}
              data-testid="people-erasure-anonymise-confirm"
            >
              {t('people.erasure.anonymise.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** "Delete person" for a person created by mistake; with history, the reasons and the way out (Leaving the club). */
export function DeleteAction({ person, onChanged }: { person: PersonDetail; onChanged: () => Promise<void> }) {
  const t = useT()
  const router = useRouter()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const [reasons, setReasons] = React.useState<Reason[]>([])
  const remove = async () => {
    const confirmed = await confirm({
      title: t('people.erasure.delete.confirm'),
      text: t('people.erasure.delete.confirmText'),
    })
    if (!confirmed) return
    setBusy(true)
    setReasons([])
    try {
      const call = await apiCall<{ code?: string; reasons?: Reason[] }>(
        `/api/people/persons/${encodeURIComponent(person.id)}`,
        { method: 'DELETE', headers: buildOptimisticLockHeader(person.updatedAt) },
      )
      if (call.ok) {
        flash(t('people.erasure.flash.deleted'), 'success')
        router.push(PERSONS_HREF)
        return
      }
      if (errorCodeOf(call.result) === 'person_in_use') setReasons(reasonsOf(call.result))
      else if (call.status === 409) {
        flash(t('people.leaving.flash.stale'), 'warning')
        await onChanged()
      } else flash(t('people.erasure.errors.delete'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-testid="people-erasure-delete">
      <h3 className="text-sm font-semibold">{t('people.erasure.delete.title')}</h3>
      <p className="text-muted-foreground text-sm">{t('people.erasure.delete.hint')}</p>
      <div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
          {t('people.erasure.delete.action')}
        </Button>
      </div>
      {reasons.length > 0 ? (
        <>
          <ReasonList personId={person.id} reasons={reasons} title={t('people.errors.person_in_use')} />
          <p className="text-sm">{t('people.erasure.delete.useLeaving')}</p>
        </>
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
