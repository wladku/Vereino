'use client'
// M-J4 (sign-up form spec DD-J12; #801) on the spot `vereino:club:occurrence:attendance:extra` of `activities`' page
// `/club/occurrences/[id]/attendance`; the context names the session.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { TrialParticipantsCard } from '../../../components/club/TrialParticipantsCard'

export type TrialParticipantsContext = { occurrence?: { id?: unknown } | null }

export default function TrialParticipantsWidget({
  context,
}: InjectionWidgetComponentProps<TrialParticipantsContext, Record<string, unknown>>) {
  const id = context.occurrence?.id
  if (typeof id !== 'string' || !id) return null
  return <TrialParticipantsCard occurrenceId={id} />
}
