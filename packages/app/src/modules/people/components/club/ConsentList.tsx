'use client'
// The three guardianship consents as read-only lines (E06-S22 #104; README M-10 "consent toggles with date and
// author"): on the profile's wards section and — for a ward with an account — under each guardian, where the ward sees
// them without controls (only a guardian changes them, on `/club/wards/[personId]`). People life-cycle spec REQ-L10
// (#309): a consent shows the club's own text when the club changed it (DD-39), a consent given before that change
// reads "given to an earlier wording" and stays valid (DD-L11), and `ConsentEffect` states what withdrawing changes.
import * as React from 'react'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { givenToEarlierWording } from '../../lib/people-rules'
import {
  WARD_CONSENT_KINDS,
  formatInstant,
  type ConsentTextKey,
  type ConsentTexts,
  type WardConsent,
  type WardConsentKind,
  type WardConsents,
} from './member-client'
import { StatusTag } from '@vereino/ui'

/** The club's own text of a consent, else the built-in text under `builtInKey` (club spec DD-39). */
export function useConsentLabel(texts: ConsentTexts | undefined) {
  const t = useT()
  return (key: ConsentTextKey, builtInKey: string, params?: Record<string, string>): string =>
    texts?.[key]?.text ?? t(builtInKey, params)
}

/** DD-L11: "Given to an earlier wording" beside a consent given before the club last changed its text. */
export function EarlierWording({
  consent,
  textKey,
  texts,
}: {
  consent: { granted: boolean; at: string | null }
  textKey: ConsentTextKey
  texts: ConsentTexts | undefined
}) {
  const t = useT()
  if (!givenToEarlierWording(consent, texts?.[textKey]?.changedAt)) return null
  return (
    <span data-testid={`club-consent-earlier-${textKey}`}>
      <StatusTag status="warning">{t('people.club.consents.earlierWording')}</StatusTag>
    </span>
  )
}

/** What withdrawing (or not giving) the consent changes (people life-cycle spec *What withdrawing a consent changes*). */
export function ConsentEffect({ kind }: { kind: WardConsentKind }) {
  const t = useT()
  return (
    <p className="text-muted-foreground max-w-prose text-xs" data-testid={`club-consent-effect-${kind}`}>
      {t(`people.club.profile.consents.effect.${kind}`)}
    </p>
  )
}

/** "Given on {date} by {author}", "Withdrawn on …", or "Not given" — the state line of one consent. */
export function useConsentStatus(timeZone: string): (consent: WardConsent) => string {
  const t = useT()
  const locale = useLocale()
  return (consent) => {
    const date = formatInstant(consent.at, locale, timeZone)
    if (!date) return t('people.club.ward.consents.notGiven')
    // A family author by name; anyone else by the role label only (#191).
    const role = consent.byRole
    const name =
      consent.byName ??
      (role ? t(role === 'staff' ? 'people.club.consents.authorStaff' : `people.roles.role.${role}`) : null)
    if (consent.granted) {
      return name ? t('people.club.consents.givenBy', { date, name }) : t('people.club.consents.givenOn', { date })
    }
    return name
      ? t('people.club.consents.withdrawnBy', { date, name })
      : t('people.club.consents.withdrawnOn', { date })
  }
}

export function ConsentList({
  consents,
  timeZone,
  texts,
}: {
  consents: WardConsents
  timeZone: string
  texts?: ConsentTexts
}) {
  const t = useT()
  const status = useConsentStatus(timeZone)
  const label = useConsentLabel(texts)
  return (
    <ul className="flex flex-col gap-2" data-testid="club-consent-list">
      {WARD_CONSENT_KINDS.map((kind) => {
        const consent = consents[kind]
        return (
          <li
            key={kind}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
            data-testid={`club-consent-${kind}`}
          >
            <span className="font-medium">{label(kind, `people.guardianships.consents.${kind}`)}</span>
            <StatusTag status={consent.granted ? 'success' : 'neutral'}>
              {t(consent.granted ? 'people.club.consents.granted' : 'people.club.consents.notGranted')}
            </StatusTag>
            {consent.at ? <span className="text-muted-foreground text-xs">{status(consent)}</span> : null}
            <EarlierWording consent={consent} textKey={kind} texts={texts} />
          </li>
        )
      })}
    </ul>
  )
}
