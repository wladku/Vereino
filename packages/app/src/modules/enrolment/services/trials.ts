// The "Trial participants" card of a session (sign-up form spec M-J4, DD-J12, REQ-J16, *Security* → A17 recipients;
// phase 4, #801): the trial participants of one session — name, age on the session day, the guardian's phone (the
// adult's own for `kind = adult`) and the mark — for a coach of the session's group, the session's assigned coach or a
// club administrator. A session of another club, an unknown one or one the caller does not coach answers null (404).
// Ids are read first; only when the session has trial participants is the read recorded (`auditedRead` into
// `enrolment_trial_read_logs`, committed before any name or phone is decrypted).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { assertInScope, auditedRead, scopeContract } from '@/modules/foundation'
import { Application, TrialReadLog } from '../data/entities'
import { ageOnReference } from '../lib/age'
import { TRIAL_MARK_KINDS, sessionTarget, trialMarkable, trialRole } from '../lib/trials'
import { sessionFacts, type EnrolmentScope } from './directory'

export const TRIAL_CARD_PURPOSE = 'trial_card'
export const TRIAL_RESOURCE_KIND = 'enrolment:application'

export type TrialParticipant = {
  applicationId: string
  kind: 'child' | 'adult'
  firstName: string
  lastName: string
  /** Full years on the session's day; null after anonymisation. */
  age: number | null
  /** The guardian's name for a child; null for an adult. */
  guardianName: string | null
  phone: string | null
  outcome: 'present' | 'absent' | null
  updatedAt: string
}

export type TrialCard = {
  occurrenceId: string
  /** The coach may mark now (the attendance list is open and the session not cancelled). */
  markable: boolean
  items: TrialParticipant[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function isScopeDenied(error: unknown): boolean {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code
  return code === 'scope_denied' || code === 'scope_unlinked'
}

export async function readTrialCard(
  ctx: CommandRuntimeContext,
  scope: EnrolmentScope,
  occurrenceId: string,
  now: Date = new Date(),
): Promise<TrialCard | null> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const session = (await sessionFacts(ctx.container, scope, [occurrenceId], em)).get(occurrenceId)
  if (!session) return null
  const grants = await scopeContract.resolve(ctx)
  let actingRole
  try {
    actingRole = trialRole(await assertInScope(grants, TRIAL_MARK_KINDS, sessionTarget(session, scope, session.id)))
  } catch (error: unknown) {
    if (isScopeDenied(error)) return null
    throw error
  }
  const ids = (
    await em.find(
      Application,
      { ...scope, deletedAt: null, state: 'trial', trialOccurrenceId: occurrenceId },
      { fields: ['id'], orderBy: { confirmedAt: 'asc', id: 'asc' } },
    )
  ).map((row) => row.id)
  const card = (items: TrialParticipant[]): TrialCard => ({
    occurrenceId,
    markable: trialMarkable(session, now),
    items,
    total: items.length,
    page: 1,
    pageSize: Math.max(items.length, 1),
    totalPages: items.length > 0 ? 1 : 0,
  })
  if (ids.length === 0) return card([])
  const rows = await auditedRead(
    ctx,
    {
      log: TrialReadLog,
      scope,
      actingRole,
      resourceKind: TRIAL_RESOURCE_KIND,
      resourceIds: ids,
      purpose: TRIAL_CARD_PURPOSE,
      fields: ['participantName', 'age', 'guardianName', 'phone'],
      extra: { occurrenceId },
    },
    () =>
      findWithDecryption(
        em,
        Application,
        { id: { $in: ids }, ...scope, deletedAt: null, state: 'trial', trialOccurrenceId: occurrenceId },
        { orderBy: { confirmedAt: 'asc', id: 'asc' } },
        scope,
      ),
  )
  return card(
    rows.map((row) => ({
      applicationId: row.id,
      kind: row.kind,
      firstName: row.participantFirstName ?? '',
      lastName: row.participantLastName ?? '',
      age:
        row.participantBirthDate && !row.anonymizedAt
          ? ageOnReference(row.participantBirthDate, session.occurrenceDate)
          : null,
      guardianName:
        row.kind === 'child' ? [row.guardianFirstName, row.guardianLastName].filter(Boolean).join(' ') || null : null,
      phone: row.guardianPhone ?? null,
      outcome: row.trialOutcome ?? null,
      updatedAt: row.updatedAt.toISOString(),
    })),
  )
}
