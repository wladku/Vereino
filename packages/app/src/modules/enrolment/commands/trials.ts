// The trial session of an application (sign-up form spec *Domain Vocabulary* → Trial, DD-J12, Q-J07, REQ-J12,
// REQ-J16; phase 4, #801):
// - `enrolment.applications.propose_trial` (BR-J5, undoable): one of the next planned sessions of the application's
//   group — or of the group the coordinator picks — becomes its trial session; `new|waiting → trial`, or `trial → trial`
//   once the previous session is over or cancelled (one at a time, Q-J07). The applicant gets `enrolment.trial_proposed`
//   with the date, time, place and the group's public conditions (what to bring);
// - `enrolment.applications.withdraw_trial` (BR-J5, undoable): the coordinator drops a proposed session before it
//   starts; `trial → new`, the applicant gets `enrolment.trial_cancelled`;
// - `enrolment.applications.trial_session_cancelled` (the `activities.occurrence.cancelled` subscriber, job context):
//   every application whose trial session was cancelled goes back to `new`; the applicant gets
//   `enrolment.trial_cancelled` and the deciders of the section the in-app `enrolment.trial_session_cancelled`;
// - `enrolment.trials.mark` (REQ-J16): a coach of the session's group, the session's assigned coach or a club
//   administrator marks the trial participant present or absent (or clears the mark) from the moment the attendance
//   list opens. No attendance row, membership or person is written, so nothing is charged and no report changes.
// An application of a section the caller does not decide, or a session the caller does not coach, answers 404.
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { assertTransition, authorizeScoped, trustedScopeOf } from '@/modules/foundation'
import { enrolmentErrors } from '../api/errors'
import { Application } from '../data/entities'
import {
  markTrialSchema,
  proposeTrialSchema,
  trialSessionCancelledSchema,
  withdrawTrialSchema,
} from '../data/validators'
import { ageFitOf } from '../lib/age'
import { applicationTransitions, isDecidableState } from '../lib/states'
import {
  TRIAL_MARK_KINDS,
  canProposeTrial,
  canWithdrawTrial,
  sessionTarget,
  trialMarkable,
  trialRole,
  trialSessionIssue,
} from '../lib/trials'
import {
  applicationTargets,
  clubDay,
  enrolmentSettings,
  sectionNames,
  sessionFacts,
  type EnrolmentScope,
  type OccurrenceFact,
} from '../services/directory'
import { applicantLocale, enqueueApplicantMail, publishDispatches } from '../services/mail'
import { announceTrialSessionCancelled } from '../services/places'
import { decryptedApplication, restoreDecided, sectionNameOf } from './applications'
import {
  APPLICATION_RESOURCE_KIND,
  applicationSnapshot,
  authorizeApplicationReplay,
  authorizeDecision,
  emitAfterCommit,
  enrolmentLog,
  inWriteTransaction,
  throwFieldError,
  type ApplicationCommandResult,
} from './shared'

/** The most characters of the group's public conditions an e-mail carries. */
const CONDITIONS_MAX = 2000

const scopeOf = (row: { tenantId: string; organizationId: string }): EnrolmentScope => ({
  tenantId: row.tenantId,
  organizationId: row.organizationId,
})

// --- Propose a trial session (M-J3 Trial sheet) ---

export type ProposeTrialResult = ApplicationCommandResult & { session: OccurrenceFact }

const proposeTrialCommand: CommandHandler<Record<string, unknown>, ProposeTrialResult> = {
  id: 'enrolment.applications.propose_trial',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.propose_trial', async (em) => {
      const authorized = await authorizeDecision(proposeTrialSchema, rawInput, ctx, em)
      const row = authorized.entity as Application
      const scope = scopeOf(row)
      const { occurrenceId } = authorized.parsed
      if (!isDecidableState(row.state)) return enrolmentErrors.throw('application_state_conflict')
      const groupId = authorized.parsed.groupId ?? row.groupId ?? null
      if (!groupId) return throwFieldError('application_group_invalid', 'groupId')
      const target = (
        await applicationTargets(ctx.container, scope, {
          sectionId: row.sectionId,
          date: row.referenceDate,
          groupIds: [groupId],
          em,
        })
      ).at(0)
      if (!target?.isActive) return throwFieldError('application_group_invalid', 'groupId')
      const facts = await sessionFacts(ctx.container, scope, [occurrenceId, row.trialOccurrenceId], em)
      const current = row.trialOccurrenceId ? facts.get(row.trialOccurrenceId) : null
      // Q-J07: one trial at a time; a new one only after the previous session is over or cancelled.
      if (!canProposeTrial(row.state, current, now)) return enrolmentErrors.throw('application_state_conflict')
      const session = facts.get(occurrenceId)
      if (!session || trialSessionIssue(session, groupId, now)) {
        return throwFieldError('trial_session_invalid', 'occurrenceId')
      }
      const before = applicationSnapshot(row)
      await assertTransition(applicationTransitions, row.state, 'trial')
      row.state = 'trial'
      row.groupId = groupId
      if (row.participantBirthDate) row.ageFit = ageFitOf(row.participantBirthDate, row.referenceDate, target.fitRule)
      row.waitingSince = null
      row.trialOccurrenceId = occurrenceId
      row.trialOutcome = null
      row.decidedAt = now
      row.decidedByUserId = ctx.auth?.sub ?? null
      row.updatedAt = now
      await em.flush()
      const contact = await decryptedApplication(em, scope, row.id)
      const settings = await enrolmentSettings(ctx.container, scope)
      if (contact?.guardianEmail && settings.publicSlug) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'trial_proposed',
            event: `trial_proposed:${occurrenceId}:${String(now.getTime())}`,
            params: {
              applicationId: row.id,
              clubSlug: settings.publicSlug,
              sectionName: await sectionNameOf(ctx, scope, row.sectionId, em),
              groupName: target.name,
              startAt: session.startAt,
              endAt: session.endAt,
              timeZone: settings.timeZone,
              placeLabel: session.placeLabel,
              conditions: target.publicConditions ? target.publicConditions.slice(0, CONDITIONS_MAX) : null,
            },
            email: contact.guardianEmail,
            locale: applicantLocale(row.locale, settings.locale),
          }),
        )
      }
      return { entity: row, actingRole: authorized.actingRole, before, session }
    })
    const trusted = scopeOf(result.entity)
    await publishDispatches(ctx.container, trusted, dispatchIds)
    await emitAfterCommit('enrolment.application.decided', trusted, { id: result.entity.id, decision: 'trial' })
    return result
  },
  buildLog: ({ result }) =>
    enrolmentLog({
      result,
      labelKey: 'enrolment.audit.proposeTrial',
      fallback: 'Propose a trial session',
      context: { occurrenceId: result.session.id },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeApplicationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as { state?: string } | null | undefined
    const row = await authorizeApplicationReplay(ctx, logEntry.resourceId)
    if (row.state !== 'trial' || !before?.state) return
    await restoreDecided(ctx.transactionalEm as EntityManager, row, before as Parameters<typeof restoreDecided>[2])
  },
}

// --- Withdraw a proposed trial session (M-J3) ---

/** The applicant's e-mail that a trial session will not take place, enqueued in the caller's transaction. */
async function enqueueTrialCancelled(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: EnrolmentScope,
  row: Application,
  session: OccurrenceFact | null | undefined,
  reason: 'withdrawn' | 'cancelled',
  names?: Map<string, string>,
): Promise<string | null> {
  const contact = await decryptedApplication(em, scope, row.id)
  const settings = await enrolmentSettings(ctx.container, scope)
  if (!contact?.guardianEmail || !settings.publicSlug) return null
  return enqueueApplicantMail(ctx.container, em, scope, {
    applicationId: row.id,
    template: 'trial_cancelled',
    event: `trial_cancelled:${session?.id ?? 'none'}`,
    params: {
      applicationId: row.id,
      clubSlug: settings.publicSlug,
      sectionName: names?.get(row.sectionId) ?? (await sectionNameOf(ctx, scope, row.sectionId, em)),
      startAt: session?.startAt ?? null,
      timeZone: settings.timeZone,
      reason,
    },
    email: contact.guardianEmail,
    locale: applicantLocale(row.locale, settings.locale),
  })
}

const withdrawTrialCommand: CommandHandler<Record<string, unknown>, ApplicationCommandResult> = {
  id: 'enrolment.applications.withdraw_trial',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.withdraw_trial', async (em) => {
      const authorized = await authorizeDecision(withdrawTrialSchema, rawInput, ctx, em)
      const row = authorized.entity as Application
      const scope = scopeOf(row)
      const session = row.trialOccurrenceId
        ? (await sessionFacts(ctx.container, scope, [row.trialOccurrenceId], em)).get(row.trialOccurrenceId)
        : null
      if (!canWithdrawTrial(row.state, session, now)) return enrolmentErrors.throw('application_state_conflict')
      const before = applicationSnapshot(row)
      await assertTransition(applicationTransitions, row.state, 'new')
      row.state = 'new'
      row.trialOccurrenceId = null
      row.trialOutcome = null
      row.decidedAt = now
      row.decidedByUserId = ctx.auth?.sub ?? null
      row.updatedAt = now
      await em.flush()
      dispatchIds.push(await enqueueTrialCancelled(ctx, em, scope, row, session, 'withdrawn'))
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await publishDispatches(ctx.container, scopeOf(result.entity), dispatchIds)
    return result
  },
  buildLog: ({ result }) =>
    enrolmentLog({ result, labelKey: 'enrolment.audit.withdrawTrial', fallback: 'Withdraw a trial session' }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeApplicationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as { state?: string } | null | undefined
    const row = await authorizeApplicationReplay(ctx, logEntry.resourceId)
    if (row.state !== 'new' || before?.state !== 'trial') return
    await restoreDecided(ctx.transactionalEm as EntityManager, row, before as Parameters<typeof restoreDecided>[2])
  },
}

// --- A trial session was cancelled (`activities.occurrence.cancelled`) ---

export type TrialSessionCancelledResult = { moved: number }

const trialSessionCancelledCommand: CommandHandler<Record<string, unknown>, TrialSessionCancelledResult> = {
  id: 'enrolment.applications.trial_session_cancelled',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.trial_session_cancelled', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: trialSessionCancelledSchema,
          resourceKind: 'enrolment.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      )
      const scope: EnrolmentScope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const { occurrenceId } = authorized.parsed
      const rows = await em.find(
        Application,
        { ...scope, deletedAt: null, state: 'trial', trialOccurrenceId: occurrenceId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      if (rows.length === 0) return { scope, moved: [] as Application[] }
      const session = (await sessionFacts(ctx.container, scope, [occurrenceId], em)).get(occurrenceId)
      // A redelivered event, or a session restored since: only a session that is still cancelled moves anything.
      if (session && session.status !== 'cancelled') return { scope, moved: [] as Application[] }
      for (const row of rows) {
        await assertTransition(applicationTransitions, row.state, 'new')
        row.state = 'new'
        row.trialOccurrenceId = null
        row.trialOutcome = null
        row.updatedAt = now
      }
      await em.flush()
      const names = await sectionNames(ctx.container, scope, [...new Set(rows.map((row) => row.sectionId))], em)
      for (const row of rows) {
        dispatchIds.push(await enqueueTrialCancelled(ctx, em, scope, row, session, 'cancelled', names))
      }
      return { scope, moved: rows }
    })
    const { scope, moved } = result
    await publishDispatches(ctx.container, scope, dispatchIds)
    if (moved.length > 0) {
      const today = clubDay(await enrolmentSettings(ctx.container, scope), now)
      const names = await sectionNames(ctx.container, scope, [...new Set(moved.map((row) => row.sectionId))])
      for (const row of moved) {
        try {
          await announceTrialSessionCancelled(ctx.container, scope, {
            applicationId: row.id,
            sectionId: row.sectionId,
            sectionName: names.get(row.sectionId) ?? '—',
            today,
          })
        } catch {
          // The application is back in New anyway; the notice is a convenience.
        }
      }
    }
    return { moved: moved.length }
  },
}

// --- The coach marks a trial participant (M-J4) ---

export type MarkTrialResult = ApplicationCommandResult & { outcome: string | null }

const markTrialCommand: CommandHandler<Record<string, unknown>, MarkTrialResult> = {
  id: 'enrolment.trials.mark',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    return inWriteTransaction(ctx, 'enrolment.trials.mark', async (em) => {
      const trusted = trustedScopeOf(ctx)
      let session: OccurrenceFact | undefined
      const authorized = await authorizeScoped(
        {
          input: markTrialSchema,
          resourceKind: APPLICATION_RESOURCE_KIND,
          allowedKinds: TRIAL_MARK_KINDS,
          loadTarget: async (parsed, tx, lock) => {
            if (!trusted) return null
            const row = await tx.findOne(
              Application,
              { id: parsed.id, ...trusted, deletedAt: null, state: 'trial' },
              lock,
            )
            if (!row?.trialOccurrenceId) return null
            session = (await sessionFacts(ctx.container, trusted, [row.trialOccurrenceId], tx)).get(
              row.trialOccurrenceId,
            )
            return session ? row : null
          },
          resolveTarget: (_parsed, entity, scope) =>
            sessionTarget(session as OccurrenceFact, scope, (entity as Application).id),
          expectedUpdatedAt: (parsed) => parsed.updatedAt,
        },
        rawInput,
        ctx,
        em,
      ).catch(async (error: unknown) => {
        // A trial participant of a session the caller does not coach answers like an unknown one (D-034).
        if ((error as { body?: { code?: unknown } } | null)?.body?.code === 'scope_denied') {
          return enrolmentErrors.throw('application_not_found')
        }
        throw error
      })
      const row = authorized.entity as Application
      if (!trialMarkable(session, now)) return enrolmentErrors.throw('application_state_conflict')
      const before = applicationSnapshot(row)
      row.trialOutcome = authorized.parsed.outcome
      row.updatedAt = now
      await em.flush()
      return {
        entity: row,
        actingRole: trialRole(authorized.actingRole),
        before,
        outcome: row.trialOutcome ?? null,
      }
    })
  },
  buildLog: ({ result }) =>
    enrolmentLog({
      result,
      labelKey: 'enrolment.audit.markTrial',
      fallback: 'Mark a trial participant',
      context: { outcome: result.outcome },
    }),
}

registerCommand(proposeTrialCommand)
registerCommand(withdrawTrialCommand)
registerCommand(trialSessionCancelledCommand)
registerCommand(markTrialCommand)
