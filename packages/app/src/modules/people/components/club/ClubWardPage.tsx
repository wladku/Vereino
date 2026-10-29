'use client'
// `/club/wards/[personId]` (club spec `/club/wards/[personId]` UI row; REQ-002; #27): one ward of the signed-in
// guardian — name, date of birth, own account — and the guardianship consents (club regulations, image, trips), which
// the guardian gives or withdraws through `POST /api/people/guardianships/{id}/consents` with the guardianship's lock
// token. The page reads the ward only from the guardian's own profile (`GET /api/people/me`), so a person who is not
// the caller's ward is never shown.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ClubFrame } from './ClubFrame'
import {
  CLUB_HOME_HREF,
  MEMBER_PROFILE_QUERY_KEY,
  WARD_CONSENT_KINDS,
  formatCalendarDate,
  formatInstant,
  fullName,
  type MemberProfile,
  type MemberWard,
  type WardConsentKind,
} from './member-client'

type ConsentState = Record<WardConsentKind, boolean>

function consentState(ward: MemberWard): ConsentState {
  return {
    regulations: ward.guardianship.consents.regulations.granted,
    image: ward.guardianship.consents.image.granted,
    trips: ward.guardianship.consents.trips.granted,
  }
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function WardConsents({ ward, timeZone }: { ward: MemberWard; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<ConsentState>(() => consentState(ward))
  const [busy, setBusy] = React.useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY })

  const save = async () => {
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(ward.guardianship.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/guardianships/${ward.guardianship.id}/consents`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ consents: state }),
          },
          { errorMessage: t('people.club.ward.errors.save') },
        ),
      )
      flash(t('people.club.ward.flash.saved'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorText(error, t('people.club.ward.errors.save')), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  return (
    <form
      aria-labelledby="club-ward-consents"
      aria-busy={busy}
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h2 id="club-ward-consents" className="text-lg font-semibold">
        {t('people.club.ward.consents.title')}
      </h2>
      {WARD_CONSENT_KINDS.map((kind) => {
        const consent = ward.guardianship.consents[kind]
        const date = formatInstant(consent.at, locale, timeZone)
        let description = t('people.club.ward.consents.notGiven')
        if (consent.granted && date) description = t('people.club.ward.consents.givenOn', { date })
        else if (!consent.granted && date) description = t('people.club.ward.consents.withdrawnOn', { date })
        return (
          <SwitchField
            key={kind}
            id={`club-ward-consent-${kind}`}
            label={t(`people.guardianships.consents.${kind}`)}
            description={description}
            checked={state[kind]}
            disabled={busy}
            onCheckedChange={(checked) => {
              setState((current) => ({ ...current, [kind]: checked }))
            }}
          />
        )
      })}
      <div>
        <Button type="submit" disabled={busy} className="min-h-11 w-full sm:w-auto">
          {t('people.club.ward.actions.save')}
        </Button>
      </div>
    </form>
  )
}

function Ward({ profile, personId }: { profile: MemberProfile; personId: string }) {
  const t = useT()
  const locale = useLocale()
  const ward = profile.wards.find((candidate) => candidate.personId === personId)
  const back = (
    <Link href={CLUB_HOME_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('people.club.ward.back')}
    </Link>
  )
  if (!ward) {
    return (
      <>
        {back}
        <Alert status="warning" data-testid="club-ward-missing">
          <p className="max-w-prose">{t('people.club.ward.notYourWard')}</p>
        </Alert>
      </>
    )
  }
  const birthDate = formatCalendarDate(ward.birthDate, locale)
  return (
    <>
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{fullName(ward)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {birthDate ? (
            <span className="text-muted-foreground text-sm">
              {t('people.club.wards.birthDate', { date: birthDate })}
            </span>
          ) : null}
          {ward.hasAccount ? <StatusBadge variant="neutral">{t('people.club.wards.hasAccount')}</StatusBadge> : null}
          {ward.guardianship.isPrimaryPayer ? (
            <StatusBadge variant="info">{t('people.club.ward.primaryPayer')}</StatusBadge>
          ) : null}
        </div>
      </div>
      <WardConsents
        key={ward.guardianship.updatedAt ?? ward.guardianship.id}
        ward={ward}
        timeZone={profile.club.timezone}
      />
    </>
  )
}

export function ClubWardPage({ personId }: { personId: string }) {
  return <ClubFrame>{(profile) => <Ward profile={profile} personId={personId} />}</ClubFrame>
}
