'use client'
// "Sports medical certificate" on `/club/profile` (the adult's own) and `/club/wards/[personId]` (a guardian for the
// ward) — training outlines and medical expiry spec M-O4, REQ-O01, BR-O1 (#682). The `medical` consent comes first
// (the club's own wording when it changed it); with a consent in force the date "valid until" is saved through
// `PUT /api/people/persons/{id}/medical` with the person's lock token, and its status shows as a tag (red missing or
// expired, orange under a month, green valid). Withdrawing the consent asks for confirmation and clears the date. A
// conflict shows the platform conflict bar; every change refreshes the profile.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSwitchField, StatusTag } from '@vereino/ui'
import { EarlierWording, useConsentLabel, useConsentStatus } from './ConsentList'
import {
  MEMBER_PROFILE_QUERY_KEY,
  formatCalendarDate,
  medicalApi,
  type ConsentTexts,
  type MemberMedical,
  type WardConsent,
} from './member-client'

const TONE = { red: 'error', orange: 'warning', green: 'success' } as const

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** The status tag's word: "Missing", "Expired on {date}", "Valid until {date}" (under a month: the same, orange). */
export function useMedicalStatusText() {
  const t = useT()
  const locale = useLocale()
  return (medical: Pick<MemberMedical, 'state' | 'validUntil'>): string => {
    const date = formatCalendarDate(medical.validUntil, locale) ?? ''
    return t(`people.club.medical.state.${medical.state}`, { date })
  }
}

export type MedicalConsentTarget = {
  /** The endpoint and body that give or withdraw the `medical` consent, with the record's lock token. */
  url: string
  method: 'PUT' | 'POST'
  body: (granted: boolean) => unknown
  lockToken: string | null
}

export function MedicalSection({
  personId,
  medical,
  consent,
  consentTarget,
  timeZone,
  texts,
}: {
  personId: string
  medical: MemberMedical
  /** The caller's own decision: the adult's own consent, or this guardian's on the guardianship. */
  consent: WardConsent | undefined
  consentTarget: MedicalConsentTarget
  timeZone: string
  texts: ConsentTexts | undefined
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const label = useConsentLabel(texts)
  const status = useConsentStatus(timeZone)
  const statusText = useMedicalStatusText()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const [date, setDate] = React.useState(medical.validUntil ?? '')
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY })
  const consentLabel = label('medical', 'people.club.medical.consent')

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true)
    try {
      await action()
      flash(success, 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorText(error, failure), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const changeConsent = async (granted: boolean) => {
    if (!granted) {
      const confirmed = await confirm({
        title: t('people.club.medical.confirm.title'),
        text: t('people.club.medical.confirm.text'),
        confirmText: t('people.club.medical.confirm.withdraw'),
        cancelText: t('people.club.medical.confirm.keep'),
        variant: 'destructive',
      })
      if (!confirmed) return
    }
    await run(
      () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(consentTarget.lockToken), () =>
          apiCallOrThrow(
            consentTarget.url,
            {
              method: consentTarget.method,
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(consentTarget.body(granted)),
            },
            { errorMessage: t('people.club.medical.errors.consent') },
          ),
        ),
      t(granted ? 'people.club.medical.flash.consentGiven' : 'people.club.medical.flash.consentWithdrawn'),
      t('people.club.medical.errors.consent'),
    )
  }

  const saveDate = (validUntil: string | null) =>
    run(
      () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(medical.updatedAt), () =>
          apiCallOrThrow(
            medicalApi(personId),
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ validUntil }),
            },
            { errorMessage: t('people.club.medical.errors.save') },
          ),
        ),
      t(validUntil ? 'people.club.medical.flash.saved' : 'people.club.medical.flash.cleared'),
      t('people.club.medical.errors.save'),
    )

  const fieldId = `club-medical-${personId}-date`
  const hintId = `${fieldId}-hint`
  return (
    <section
      aria-labelledby={`club-medical-${personId}`}
      aria-busy={busy}
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      data-testid="club-medical"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`club-medical-${personId}`} className="text-lg font-semibold">
          {t('people.club.medical.title')}
        </h2>
        <span data-testid="club-medical-status" data-medical-status={medical.status}>
          <StatusTag status={TONE[medical.status]}>{statusText(medical)}</StatusTag>
        </span>
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('people.club.medical.lead')}</p>
      <div className="flex flex-col gap-1" data-testid="club-medical-consent">
        <MemberSwitchField
          id={`club-medical-${personId}-consent`}
          label={consentLabel}
          description={consent?.at ? status(consent) : t('people.club.ward.consents.notGiven')}
          badge={consent ? <EarlierWording consent={consent} textKey="medical" texts={texts} /> : undefined}
          checked={consent?.granted ?? false}
          disabled={busy}
          onCheckedChange={(checked) => {
            void changeConsent(checked)
          }}
        />
        <p className="text-muted-foreground max-w-prose text-xs">{t('people.club.medical.consentEffect')}</p>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (date) void saveDate(date)
        }}
      >
        <Label htmlFor={fieldId}>{t('people.club.medical.date')}</Label>
        <Input
          id={fieldId}
          type="date"
          className="min-h-11 sm:max-w-xs"
          value={date}
          disabled={busy || !medical.consentInForce}
          aria-describedby={hintId}
          onChange={(event) => {
            setDate(event.target.value)
          }}
          data-testid="club-medical-date"
        />
        <p id={hintId} className="text-muted-foreground max-w-prose text-xs">
          {medical.consentInForce ? t('people.club.medical.dateHint') : t('people.club.medical.needsConsent')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            className="min-h-11"
            disabled={busy || !medical.consentInForce || !date || date === (medical.validUntil ?? '')}
            data-testid="club-medical-save"
          >
            {t('people.club.medical.save')}
          </Button>
          {medical.validUntil ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                setDate('')
                void saveDate(null)
              }}
              data-testid="club-medical-clear"
            >
              {t('people.club.medical.clear')}
            </Button>
          ) : null}
        </div>
      </form>
      {ConfirmDialogElement}
    </section>
  )
}
