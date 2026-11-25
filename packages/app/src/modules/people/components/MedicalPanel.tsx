'use client'
// "Sports medical certificate" on the Details tab of the person record (training outlines and medical expiry spec M-O4,
// REQ-O01, BR-O1; #682): for a staff writer (`people.medical.manage` — the club administrator, or a coordinator for a
// member of their sections; the read carries `medical` only then) the date with its status, saved through
// `PUT /api/people/persons/{id}/medical` with the person's lock token. While no `medical` consent of the person or a
// guardian is in force the field is disabled and says so: staff never give that consent (BR-O1).
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { useMedicalStatusText } from './club/MedicalSection'
import { errorMessage, type PersonDetail } from './client-helpers'

const TONE = { red: 'error', orange: 'warning', green: 'success' } as const

export function MedicalPanel({ person, onChanged }: { person: PersonDetail; onChanged: () => Promise<void> }) {
  const t = useT()
  const statusText = useMedicalStatusText()
  const medical = person.medical
  const [date, setDate] = React.useState(medical?.validUntil ?? '')
  const [busy, setBusy] = React.useState(false)
  if (!medical) return null

  const save = async (validUntil: string | null) => {
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(medical.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/persons/${encodeURIComponent(person.id)}/medical`,
          { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ validUntil }) },
          { errorMessage: t('people.club.medical.errors.save') },
        ),
      )
      flash(t(validUntil ? 'people.club.medical.flash.saved' : 'people.club.medical.flash.cleared'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('people.club.medical.errors.save')), 'error')
      }
    } finally {
      setBusy(false)
      await onChanged()
    }
  }

  const fieldId = `person-medical-${person.id}`
  return (
    <section
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      aria-label={t('people.club.medical.title')}
      aria-busy={busy}
      data-testid="person-medical"
    >
      <SectionHeader title={t('people.club.medical.title')} />
      <span data-testid="person-medical-status" data-medical-status={medical.status}>
        <StatusTag status={TONE[medical.status]}>{statusText(medical)}</StatusTag>
      </span>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (date) void save(date)
        }}
      >
        <Label htmlFor={fieldId}>{t('people.club.medical.date')}</Label>
        <Input
          id={fieldId}
          type="date"
          className="sm:max-w-xs"
          value={date}
          disabled={busy || !medical.consentInForce}
          aria-describedby={`${fieldId}-hint`}
          onChange={(event) => {
            setDate(event.target.value)
          }}
          data-testid="person-medical-date"
        />
        <p id={`${fieldId}-hint`} className="text-muted-foreground max-w-prose text-xs">
          {medical.consentInForce ? t('people.persons.medical.hint') : t('people.persons.medical.needsConsent')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || !medical.consentInForce || !date || date === (medical.validUntil ?? '')}
            data-testid="person-medical-save"
          >
            {t('people.club.medical.save')}
          </Button>
          {medical.validUntil ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDate('')
                void save(null)
              }}
              data-testid="person-medical-clear"
            >
              {t('people.club.medical.clear')}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  )
}
