'use client'
// `/club/wards/[personId]` (club spec `/club/wards/[personId]` UI row; REQ-002; #27): one ward of the signed-in
// guardian — name, date of birth, own account — and the guardianship consents (club regulations, image, trips), which
// the guardian gives or withdraws through `POST /api/people/guardianships/{id}/consents` with the guardianship's lock
// token. The page reads the ward only from the guardian's own profile (`GET /api/people/me`), so a person who is not
// the caller's ward is never shown. E06-S22 (#104): the ward's age, groups and sections (the `groups` widget on the
// `vereino:club:ward:groups` spot) and each consent's last author. People life-cycle spec REQ-L10 (#309): each consent
// shows the club's own wording (DD-39), "given to an earlier wording" when given before the club changed it (DD-L11),
// and the line saying what withdrawing changes. Phase L8 (#310): the lines "May have an own account — ask the club" and
// "Turns 18 on {date}: from then {name} decides alone". #682 (M-O4): the ward's sports medical certificate — the
// guardian's `medical` consent and the date (`MedicalSection`).
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSwitchField, StatusTag } from '@vereino/ui'
import { ClubFrame } from './ClubFrame'
import { ConsentEffect, EarlierWording, useConsentLabel, useConsentStatus } from './ConsentList'
import { WardNotices } from './LifeCycleNotices'
import { MedicalSection } from './MedicalSection'
import {
  CLUB_HOME_HREF,
  MEMBER_PROFILE_QUERY_KEY,
  WARD_CONSENT_KINDS,
  formatCalendarDate,
  fullName,
  type ConsentTexts,
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

function WardConsents({ ward, timeZone, texts }: { ward: MemberWard; timeZone: string; texts?: ConsentTexts }) {
  const t = useT()
  const status = useConsentStatus(timeZone)
  const label = useConsentLabel(texts)
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
        return (
          <div key={kind} className="flex flex-col gap-1">
            <MemberSwitchField
              id={`club-ward-consent-${kind}`}
              label={label(kind, `people.guardianships.consents.${kind}`)}
              description={status(ward.guardianship.consents[kind])}
              badge={<EarlierWording consent={ward.guardianship.consents[kind]} textKey={kind} texts={texts} />}
              checked={state[kind]}
              disabled={busy}
              onCheckedChange={(checked) => {
                setState((current) => ({ ...current, [kind]: checked }))
              }}
            />
            <ConsentEffect kind={kind} />
          </div>
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
        <Alert style="light" status="warning" data-testid="club-ward-missing">
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
          {ward.age !== null ? (
            <span className="text-muted-foreground text-sm">
              {t('people.club.profile.wards.age', { age: String(ward.age) })}
            </span>
          ) : null}
          {ward.hasAccount ? <StatusTag status="neutral">{t('people.club.wards.hasAccount')}</StatusTag> : null}
          {ward.guardianship.isPrimaryPayer ? (
            <StatusTag status="info">{t('people.club.ward.primaryPayer')}</StatusTag>
          ) : null}
        </div>
      </div>
      <WardNotices ward={ward} />
      <InjectionSpot spotId="vereino:club:ward:groups" context={{ personId: ward.personId, variant: 'section' }} />
      <WardConsents
        key={ward.guardianship.updatedAt ?? ward.guardianship.id}
        ward={ward}
        timeZone={profile.club.timezone}
        texts={profile.consentTexts}
      />
      {ward.medical ? (
        <MedicalSection
          key={`${ward.medical.updatedAt ?? ''}:${ward.guardianship.updatedAt ?? ''}`}
          personId={ward.personId}
          medical={ward.medical}
          consent={ward.guardianship.consents.medical}
          consentTarget={{
            url: `/api/people/guardianships/${ward.guardianship.id}/consents`,
            method: 'POST',
            body: (granted) => ({ consents: { medical: granted } }),
            lockToken: ward.guardianship.updatedAt,
          }}
          timeZone={profile.club.timezone}
          texts={profile.consentTexts}
        />
      ) : null}
    </>
  )
}

export function ClubWardPage({ personId }: { personId: string }) {
  return <ClubFrame>{(profile) => <Ward profile={profile} personId={personId} />}</ClubFrame>
}
