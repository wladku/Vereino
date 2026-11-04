'use client'
// `/club/profile` (club spec `/club/profile` UI row; REQ-001, REQ-006, REQ-035, REQ-037; #27): the member's interface
// language (null = the club default), contact details and — for a guardian — the two consents "share my contact
// details with my children's coaches" (DD-39) and "show my children's presence to other guardians" (REQ-006), each
// shown with the date it was given and withdrawable at any time. One form, one save through `PUT /api/people/me` with
// the person's lock token; a conflict shows the platform's conflict bar. Platform primitives with bound labels are
// used instead of `CrudForm`, whose labels are not associated with their inputs (lesson
// `platform-crudform-labels-axe-baseline`) and which cannot show each consent's date next to its switch.
// E06-S22 (#104; README M-10): a phone that is neither Polish nor E.164 is refused with 422 `phone_invalid`, shown under
// the field; below the form, a guardian's "Wards and consents" (each ward's age, account, groups with sections — the
// `groups` widget on the `vereino:club:ward:groups` spot — and the three consents with date and author), a ward's
// "My guardians" with the consents read-only (R10: consents and payments stay with the guardian), and the link to the
// platform's change-password page.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { normalizeCrudServerError } from '@open-mercato/ui/backend/utils/serverErrors'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { resolveLocaleLabel } from '@open-mercato/shared/lib/i18n/locale-label'
import { useLocale, useSupportedLocales, useT } from '@open-mercato/shared/lib/i18n/context'
import { ClubFrame } from './ClubFrame'
import { ConsentList } from './ConsentList'
import {
  CHANGE_PASSWORD_HREF,
  MEMBER_PROFILE_API,
  MEMBER_PROFILE_QUERY_KEY,
  formatCalendarDate,
  formatInstant,
  fullName,
  type MemberGuardian,
  type MemberProfile,
  type MemberWard,
  type SelfConsent,
} from './member-client'

/** The language select's value for "the club's default" (Radix `Select` items cannot carry an empty value). */
const CLUB_DEFAULT = 'club_default'

type FormState = {
  preferredLocale: string
  email: string
  phone: string
  shareContactWithCoaches: boolean
  sharePresenceWithGuardians: boolean
}

function initialState(profile: MemberProfile): FormState {
  return {
    preferredLocale: profile.person.preferredLocale ?? CLUB_DEFAULT,
    email: profile.person.email ?? '',
    phone: profile.person.phone ?? '',
    shareContactWithCoaches: profile.person.consents.shareContactWithCoaches.granted,
    sharePresenceWithGuardians: profile.person.consents.sharePresenceWithGuardians.granted,
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function ProfileForm({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const locale = useLocale()
  const supportedLocales = useSupportedLocales()
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<FormState>(() => initialState(profile))
  const [busy, setBusy] = React.useState(false)
  const [phoneError, setPhoneError] = React.useState<string | null>(null)
  const isGuardian = profile.wards.length > 0
  const refresh = () => queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY })

  const consentDescription = (consent: SelfConsent) => {
    const date = formatInstant(consent.at, locale, profile.club.timezone)
    return consent.granted && date
      ? t('people.club.profile.consents.givenOn', { date })
      : t('people.club.profile.consents.notGiven')
  }

  const save = async () => {
    setBusy(true)
    setPhoneError(null)
    try {
      const body = {
        preferredLocale: state.preferredLocale === CLUB_DEFAULT ? null : state.preferredLocale,
        email: blankToNull(state.email),
        phone: blankToNull(state.phone),
        ...(isGuardian
          ? {
              shareContactWithCoaches: state.shareContactWithCoaches,
              sharePresenceWithGuardians: state.sharePresenceWithGuardians,
            }
          : {}),
      }
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(profile.person.updatedAt), () =>
        apiCallOrThrow(
          MEMBER_PROFILE_API,
          { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
          { errorMessage: t('people.club.profile.errors.save') },
        ),
      )
      flash(t('people.club.profile.flash.saved'), 'success')
    } catch (error: unknown) {
      const fieldError = normalizeCrudServerError(error).fieldErrors?.phone
      if (fieldError) {
        // The form keeps what was typed (no refresh), so the member corrects the number in place.
        setPhoneError(fieldError)
        setBusy(false)
        return
      }
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorText(error, t('people.club.profile.errors.save')), 'error')
      }
    }
    setBusy(false)
    await refresh()
  }

  const birthDate = formatCalendarDate(profile.person.birthDate, locale)
  const clubDefaultLabel = t('people.club.profile.language.clubDefault', {
    language: resolveLocaleLabel(profile.club.defaultLocale),
  })

  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h1 className="text-2xl font-semibold">{t('people.club.profile.title')}</h1>

      <section aria-labelledby="club-profile-details" className="bg-card flex flex-col gap-4 rounded-lg border p-4">
        <h2 id="club-profile-details" className="text-lg font-semibold">
          {t('people.club.profile.details.title')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{t('people.club.profile.details.name')}</dt>
            <dd className="text-sm break-words">{fullName(profile.person)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{t('people.club.profile.details.birthDate')}</dt>
            <dd className="text-sm">{birthDate ?? t('people.common.empty')}</dd>
          </div>
        </dl>
        <FormField label={t('people.club.profile.fields.email')} disabled={busy}>
          <Input
            type="email"
            autoComplete="email"
            value={state.email}
            onChange={(event) => {
              setState((current) => ({ ...current, email: event.target.value }))
            }}
          />
        </FormField>
        <FormField
          label={t('people.club.profile.fields.phone')}
          description={t('people.club.profile.fields.phoneHelp')}
          error={phoneError ?? undefined}
          disabled={busy}
        >
          <Input
            type="tel"
            autoComplete="tel"
            value={state.phone}
            onChange={(event) => {
              setPhoneError(null)
              setState((current) => ({ ...current, phone: event.target.value }))
            }}
          />
        </FormField>
      </section>

      <section aria-labelledby="club-profile-language" className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <h2 id="club-profile-language" className="text-lg font-semibold">
          {t('people.club.profile.language.title')}
        </h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="club-profile-locale">{t('people.club.profile.language.label')}</Label>
          <Select
            value={state.preferredLocale}
            disabled={busy}
            onValueChange={(value) => {
              setState((current) => ({ ...current, preferredLocale: value }))
            }}
          >
            <SelectTrigger id="club-profile-locale" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLUB_DEFAULT}>{clubDefaultLabel}</SelectItem>
              {supportedLocales.map((code) => (
                <SelectItem key={code} value={code}>
                  {resolveLocaleLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground max-w-prose text-xs">{t('people.club.profile.language.description')}</p>
        </div>
      </section>

      {isGuardian ? (
        <section
          aria-labelledby="club-profile-consents"
          className="bg-card flex flex-col gap-4 rounded-lg border p-4"
          data-testid="club-profile-consents"
        >
          <h2 id="club-profile-consents" className="text-lg font-semibold">
            {t('people.club.profile.consents.title')}
          </h2>
          <SwitchField
            id="club-consent-share-contact"
            label={t('people.club.profile.consents.shareContactWithCoaches')}
            description={consentDescription(profile.person.consents.shareContactWithCoaches)}
            checked={state.shareContactWithCoaches}
            disabled={busy}
            onCheckedChange={(checked) => {
              setState((current) => ({ ...current, shareContactWithCoaches: checked }))
            }}
          />
          <SwitchField
            id="club-consent-share-presence"
            label={t('people.club.profile.consents.sharePresenceWithGuardians')}
            description={consentDescription(profile.person.consents.sharePresenceWithGuardians)}
            checked={state.sharePresenceWithGuardians}
            disabled={busy}
            onCheckedChange={(checked) => {
              setState((current) => ({ ...current, sharePresenceWithGuardians: checked }))
            }}
          />
          <p className="text-muted-foreground max-w-prose text-xs">{t('people.club.profile.consents.withdrawHint')}</p>
        </section>
      ) : null}

      <div>
        <Button type="submit" disabled={busy} className="min-h-11 w-full sm:w-auto">
          {t('people.club.profile.actions.save')}
        </Button>
      </div>
    </form>
  )
}

function WardEntry({ ward, timeZone }: { ward: MemberWard; timeZone: string }) {
  const t = useT()
  return (
    <li className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0" data-testid="club-profile-ward">
      <div className="flex flex-col gap-1">
        <Link
          href={`/club/wards/${ward.personId}`}
          className="text-primary inline-flex min-h-11 items-center font-semibold underline"
        >
          {fullName(ward)}
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          {ward.age !== null ? (
            <span className="text-muted-foreground text-sm">
              {t('people.club.profile.wards.age', { age: String(ward.age) })}
            </span>
          ) : null}
          <StatusBadge variant="neutral">
            {t(ward.hasAccount ? 'people.club.wards.hasAccount' : 'people.club.profile.wards.noAccount')}
          </StatusBadge>
        </span>
      </div>
      <InjectionSpot spotId="vereino:club:ward:groups" context={{ personId: ward.personId, variant: 'compact' }} />
      <ConsentList consents={ward.guardianship.consents} timeZone={timeZone} />
    </li>
  )
}

/** "Wards and consents" — a guardian only (README M-10: for a person without children the section is hidden). */
function WardsSection({ profile }: { profile: MemberProfile }) {
  const t = useT()
  if (profile.wards.length === 0) return null
  return (
    <section
      aria-labelledby="club-profile-wards"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      data-testid="club-profile-wards"
    >
      <h2 id="club-profile-wards" className="text-lg font-semibold">
        {t('people.club.profile.wards.title')}
      </h2>
      <ul className="flex flex-col gap-4">
        {profile.wards.map((ward) => (
          <WardEntry key={ward.personId} ward={ward} timeZone={profile.club.timezone} />
        ))}
      </ul>
      <p className="text-muted-foreground max-w-prose text-xs">{t('people.club.profile.wards.changeHint')}</p>
    </section>
  )
}

function GuardianEntry({ guardian, timeZone }: { guardian: MemberGuardian; timeZone: string }) {
  const t = useT()
  return (
    <li className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0" data-testid="club-profile-guardian">
      <span className="font-semibold">
        {fullName(guardian)}{' '}
        <span className="text-muted-foreground text-sm font-normal">
          ({t(`people.guardianships.relation.${guardian.relation}`)})
        </span>
      </span>
      <ConsentList consents={guardian.consents} timeZone={timeZone} />
    </li>
  )
}

/** "My guardians" — a member who is a ward: who the guardians are and the consents, read-only (R10). */
function GuardiansSection({ profile }: { profile: MemberProfile }) {
  const t = useT()
  if (profile.guardians.length === 0) return null
  const names = profile.guardians.map((guardian) => fullName(guardian)).join(', ')
  return (
    <section
      aria-labelledby="club-profile-guardians"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      data-testid="club-profile-guardians"
    >
      <h2 id="club-profile-guardians" className="text-lg font-semibold">
        {t('people.club.profile.guardians.title')}
      </h2>
      <p className="max-w-prose text-sm">{t('people.club.profile.guardians.summary', { names })}</p>
      <ul className="flex flex-col gap-4">
        {profile.guardians.map((guardian) => (
          <GuardianEntry key={guardian.guardianshipId} guardian={guardian} timeZone={profile.club.timezone} />
        ))}
      </ul>
    </section>
  )
}

function PasswordSection() {
  const t = useT()
  return (
    <section aria-labelledby="club-profile-password" className="bg-card flex flex-col gap-2 rounded-lg border p-4">
      <h2 id="club-profile-password" className="text-lg font-semibold">
        {t('people.club.profile.password.title')}
      </h2>
      <Link
        href={CHANGE_PASSWORD_HREF}
        className="text-primary inline-flex min-h-11 items-center text-sm underline"
        data-testid="club-profile-change-password"
      >
        {t('people.club.profile.password.change')}
      </Link>
    </section>
  )
}

export function ClubProfilePage() {
  // Keyed by the lock token: a saved or reloaded profile starts the form from the stored values.
  return (
    <ClubFrame>
      {(profile) => (
        <div className="flex flex-col gap-6">
          <ProfileForm key={profile.person.updatedAt ?? profile.person.id} profile={profile} />
          <WardsSection profile={profile} />
          <GuardiansSection profile={profile} />
          <PasswordSection />
        </div>
      )}
    </ClubFrame>
  )
}
