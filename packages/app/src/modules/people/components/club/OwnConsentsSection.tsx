'use client'
// "My consents" on `/club/profile` (people life-cycle spec M-10 row, REQ-L10; #309): an adult participant gives and
// withdraws their own consents — club regulations, image, trips (mockup `m.screenProfile.consentRegulations`,
// `…consentImage`, `…consentTrips`) — each with its state, date and author, the club's own wording when the club changed
// it (DD-39; a consent given before that reads "given to an earlier wording", DD-L11) and the line saying what
// withdrawing changes. Giving saves at once; withdrawing asks for confirmation first and names the effect. Each change
// goes through `PUT /api/people/me/consents` with the person's lock token; a conflict shows the platform conflict bar.
// Nothing blocks taking part when a consent is not given (Q-L15). A minor gets no section (`ownConsents` is null).
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSwitchField } from '@vereino/ui'
import { ConsentEffect, EarlierWording, useConsentLabel, useConsentStatus } from './ConsentList'
import {
  MEMBER_PROFILE_QUERY_KEY,
  OWN_CONSENTS_API,
  WARD_CONSENT_KINDS,
  type MemberProfile,
  type WardConsentKind,
} from './member-client'

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function OwnConsentsSection({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const queryClient = useQueryClient()
  const status = useConsentStatus(profile.club.timezone)
  const label = useConsentLabel(profile.consentTexts)
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const consents = profile.ownConsents
  if (!consents) return null

  const labelOf = (kind: WardConsentKind) => label(kind, `people.club.profile.consents.${kind}`)

  const change = async (kind: WardConsentKind, granted: boolean) => {
    if (!granted) {
      const confirmed = await confirm({
        title: t('people.club.profile.ownConsents.confirm.title', { consent: labelOf(kind) }),
        text: t(`people.club.profile.consents.effect.${kind}`),
        confirmText: t('people.club.profile.ownConsents.confirm.withdraw'),
        cancelText: t('people.club.profile.ownConsents.confirm.keep'),
        variant: 'destructive',
      })
      if (!confirmed) return
    }
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(profile.person.updatedAt), () =>
        apiCallOrThrow(
          OWN_CONSENTS_API,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ changes: { [kind]: granted } }),
          },
          { errorMessage: t('people.club.profile.ownConsents.errors.save') },
        ),
      )
      flash(
        t(granted ? 'people.club.profile.ownConsents.flash.given' : 'people.club.profile.ownConsents.flash.withdrawn'),
        'success',
      )
    } catch (error: unknown) {
      if (
        !surfaceRecordConflict(error, t, {
          onRefresh: () => void queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY }),
        })
      ) {
        flash(errorText(error, t('people.club.profile.ownConsents.errors.save')), 'error')
      }
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY })
    }
  }

  return (
    <section
      aria-labelledby="club-profile-own-consents"
      aria-busy={busy}
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      data-testid="club-profile-own-consents"
    >
      <h2 id="club-profile-own-consents" className="text-lg font-semibold">
        {t('people.club.profile.ownConsents.title')}
      </h2>
      <p className="text-muted-foreground max-w-prose text-sm">{t('people.club.profile.ownConsents.lead')}</p>
      <ul className="flex flex-col gap-4">
        {WARD_CONSENT_KINDS.map((kind) => {
          const consent = consents[kind]
          return (
            <li
              key={kind}
              className="flex flex-col gap-1 border-t pt-4 first:border-t-0 first:pt-0"
              data-testid={`club-own-consent-${kind}`}
            >
              <MemberSwitchField
                id={`club-own-consent-${kind}-switch`}
                label={labelOf(kind)}
                description={consent.at ? status(consent) : t('people.club.ward.consents.notGiven')}
                badge={<EarlierWording consent={consent} textKey={kind} texts={profile.consentTexts} />}
                checked={consent.granted}
                disabled={busy}
                onCheckedChange={(checked) => {
                  void change(kind, checked)
                }}
              />
              <ConsentEffect kind={kind} />
            </li>
          )
        })}
      </ul>
      {ConfirmDialogElement}
    </section>
  )
}
