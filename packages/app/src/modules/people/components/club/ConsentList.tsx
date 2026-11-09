'use client'
// The three guardianship consents as read-only lines (E06-S22 #104; README M-10 "consent toggles with date and
// author"): on the profile's wards section and — for a ward with an account — under each guardian, where the ward sees
// them without controls (only a guardian changes them, on `/club/wards/[personId]`).
import * as React from 'react'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { WARD_CONSENT_KINDS, formatInstant, type WardConsent, type WardConsents } from './member-client'

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

export function ConsentList({ consents, timeZone }: { consents: WardConsents; timeZone: string }) {
  const t = useT()
  const status = useConsentStatus(timeZone)
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
            <span className="font-medium">{t(`people.guardianships.consents.${kind}`)}</span>
            <StatusBadge variant={consent.granted ? 'success' : 'neutral'}>
              {t(consent.granted ? 'people.club.consents.granted' : 'people.club.consents.notGranted')}
            </StatusBadge>
            {consent.at ? <span className="text-muted-foreground text-xs">{status(consent)}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}
