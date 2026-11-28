'use client'
// M-J4 "Trial participants" (sign-up form spec DD-J12, REQ-J16, J-J03; phase 4, #801) on the attendance page of a
// session (`activities`' spot `vereino:club:occurrence:attendance:extra`): the session's trial participants — name,
// age, the guardian (tap to call) — with present / absent toggles the coach saves one by one. Shown only to a caller
// holding `enrolment.trials.mark` (the `/club` spots do not enforce a widget's features, so the card checks first) and
// only when the session has trial participants; a session the caller does not coach shows nothing. The marks open with
// the attendance list (30 minutes before the start). A participant changed meanwhile refreshes the card.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Notice, StatusTag, useGrantedFeatures } from '@vereino/ui'
import { TRIAL_CARD_QUERY_KEY, markTrial, useTrialCard, type TrialParticipant } from './applications-client'

const MARK_FEATURES = ['enrolment.trials.mark'] as const

type Outcome = 'present' | 'absent'

function ParticipantRow({
  participant,
  markable,
  busy,
  onMark,
}: {
  participant: TrialParticipant
  markable: boolean
  busy: boolean
  onMark: (participant: TrialParticipant, outcome: Outcome | null) => void
}) {
  const t = useT()
  const id = React.useId()
  const name = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || t('enrolment.club.anonymised')
  return (
    <li
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="enrolment-trial-participant"
      data-application-id={participant.applicationId}
      data-outcome={participant.outcome ?? 'none'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold" id={`${id}-name`}>
          {name}
        </span>
        <StatusTag status="info">{t('enrolment.club.trialCard.tag')}</StatusTag>
      </div>
      <p className="text-muted-foreground text-sm">
        {[
          participant.age === null ? null : t('enrolment.club.trialCard.age', { age: participant.age }),
          participant.guardianName,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {participant.phone ? (
        <a
          href={`tel:${participant.phone}`}
          className="text-primary inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4"
          data-testid="enrolment-trial-phone"
        >
          {t('enrolment.club.trialCard.call', { phone: participant.phone })}
        </a>
      ) : null}
      {markable ? (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-name`}>
          {(['present', 'absent'] as const).map((outcome) => {
            const pressed = participant.outcome === outcome
            return (
              <Button
                key={outcome}
                type="button"
                variant={pressed ? 'default' : 'outline'}
                className="min-h-11"
                aria-pressed={pressed}
                disabled={busy}
                data-testid={`enrolment-trial-mark-${outcome}`}
                onClick={() => {
                  onMark(participant, pressed ? null : outcome)
                }}
              >
                {t(`enrolment.club.trialCard.${outcome}`)}
              </Button>
            )
          })}
        </div>
      ) : participant.outcome ? (
        <p className="text-sm" data-testid="enrolment-trial-outcome">
          {t(`enrolment.club.trialCard.${participant.outcome}`)}
        </p>
      ) : null}
    </li>
  )
}

export function TrialParticipantsCard({ occurrenceId }: { occurrenceId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const grants = useGrantedFeatures(MARK_FEATURES, apiCall)
  const allowed = grants['enrolment.trials.mark']
  const card = useTrialCard(occurrenceId, allowed)
  const [busy, setBusy] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')

  if (!allowed || !card.data || card.data.items.length === 0) return null
  const { items, markable } = card.data

  const onMark = async (participant: TrialParticipant, outcome: Outcome | null) => {
    setBusy(true)
    const result = await markTrial(participant.applicationId, outcome, participant.updatedAt)
    setBusy(false)
    if (result.status === 'ok') {
      const message = t('enrolment.club.trialCard.saved')
      setAnnouncement(message)
      flash(message, 'success')
    } else {
      flash(
        t(result.status === 'conflict' ? 'enrolment.club.trialCard.conflict' : 'enrolment.club.trialCard.failed'),
        'error',
      )
    }
    await queryClient.invalidateQueries({ queryKey: [TRIAL_CARD_QUERY_KEY, occurrenceId] })
  }

  return (
    <section
      aria-labelledby="enrolment-trial-card-title"
      className="flex flex-col gap-3"
      data-testid="enrolment-trial-card"
    >
      <h2 id="enrolment-trial-card-title" className="text-lg font-semibold">
        {t('enrolment.club.trialCard.title')}
      </h2>
      <p className="text-muted-foreground text-sm">{t('enrolment.club.trialCard.help')}</p>
      {!markable ? (
        <Notice data-testid="enrolment-trial-not-open">
          <p className="max-w-prose">{t('enrolment.club.trialCard.notOpen')}</p>
        </Notice>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((participant) => (
          <ParticipantRow
            key={participant.applicationId}
            participant={participant}
            markable={markable}
            busy={busy}
            onMark={(entry, outcome) => void onMark(entry, outcome)}
          />
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
