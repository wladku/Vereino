'use client'
// "Own consents" on the Guardianship and consents tab of the person record (people life-cycle spec B-10 row, REQ-L10;
// #309): for a person aged 18 or more the club administrator sees the person's own consents — club regulations, image,
// trips — with the date and the author, and changes them through `POST /api/people/persons/{id}/consents` with the
// person's lock token (a withdrawal asks for confirmation; a conflict shows the platform conflict bar). The read
// carries the consents only for `people.manage` (`ownConsents`), so a coordinator or a guardian never sees the panel.
import * as React from 'react'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CONSENT_KINDS,
  errorMessage,
  type ConsentKind,
  type OwnConsent,
  type PersonDetail,
  type Translate,
} from './client-helpers'

type Flags = Record<ConsentKind, boolean>

function flagsOf(consents: Record<ConsentKind, OwnConsent>): Flags {
  return {
    regulations: consents.regulations.granted,
    image: consents.image.granted,
    trips: consents.trips.granted,
  }
}

/** "Given on {date} by {name}", "Withdrawn on …" or "Not given" (the date is the calendar day of the change). */
function stateLine(consent: OwnConsent, t: Translate): string {
  if (!consent.at) return t('people.club.ward.consents.notGiven')
  const date = consent.at.slice(0, 10)
  const name = consent.byName ?? (consent.byRole ? t('people.club.consents.authorStaff') : null)
  if (consent.granted) {
    return name ? t('people.club.consents.givenBy', { date, name }) : t('people.club.consents.givenOn', { date })
  }
  return name ? t('people.club.consents.withdrawnBy', { date, name }) : t('people.club.consents.withdrawnOn', { date })
}

export function OwnConsentsPanel({ person, onChanged }: { person: PersonDetail; onChanged: () => Promise<void> }) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const consents = person.ownConsents
  const [flags, setFlags] = React.useState<Flags | null>(() => (consents ? flagsOf(consents) : null))
  const [busy, setBusy] = React.useState(false)
  if (!consents || !flags || !person.holdsOwnConsents) return null

  const changes = Object.fromEntries(
    CONSENT_KINDS.filter((kind) => flags[kind] !== consents[kind].granted).map((kind) => [kind, flags[kind]]),
  )
  const withdraws = Object.values(changes).some((granted) => !granted)

  const save = async () => {
    if (withdraws) {
      const confirmed = await confirm({
        title: t('people.persons.ownConsents.confirm.title'),
        text: t('people.persons.ownConsents.confirm.text'),
        variant: 'destructive',
      })
      if (!confirmed) return
    }
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(person.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/persons/${encodeURIComponent(person.id)}/consents`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ changes }) },
          { errorMessage: t('people.persons.ownConsents.errors.save') },
        ),
      )
      flash(t('people.persons.ownConsents.flash.saved'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('people.persons.ownConsents.errors.save')), 'error')
      }
    } finally {
      setBusy(false)
      await onChanged()
    }
  }

  return (
    <section
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      aria-label={t('people.persons.ownConsents.title')}
      data-testid="person-own-consents"
    >
      <SectionHeader title={t('people.persons.ownConsents.title')} />
      <p className="text-muted-foreground max-w-prose text-sm">{t('people.persons.ownConsents.lead')}</p>
      <ul className="flex flex-col gap-3">
        {CONSENT_KINDS.map((kind) => (
          <li key={kind} className="flex flex-col gap-1" data-testid={`person-own-consent-${kind}`}>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`person-own-consent-${kind}-input`}
                checked={flags[kind]}
                disabled={busy}
                onCheckedChange={(checked) => {
                  setFlags({ ...flags, [kind]: checked === true })
                }}
              />
              <Label htmlFor={`person-own-consent-${kind}-input`}>{t(`people.guardianships.consents.${kind}`)}</Label>
            </div>
            <span className="text-muted-foreground pl-6 text-xs">{stateLine(consents[kind], t)}</span>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          disabled={busy || Object.keys(changes).length === 0}
          onClick={() => {
            void save()
          }}
        >
          {t('people.guardianships.actions.saveConsents')}
        </Button>
      </div>
      {ConfirmDialogElement}
    </section>
  )
}
