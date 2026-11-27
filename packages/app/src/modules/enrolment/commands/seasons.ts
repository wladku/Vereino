// The season and operator commands of `enrolment` (phase 3, #800).
//
// `enrolment.applications.group_closed` (sign-up form spec DD-J15a, REQ-J15; phase 3, #800): a season rollover closed
// groups (`groups.season.rolled_over` → `closedGroupIds`); the open applications of those groups go back to the
// coordinator as `new` — a waiting one leaves the waiting list, a proposed trial session is dropped — and the list
// shows the flag "group closed" (computed from the group, never stored) until the coordinator chooses another group.
// A group the rollover continued keeps its id, so its applications stay where they are; the payload names no
// continuation of a closed group. Run by the rollover subscriber with a job context; repeat-safe (a redelivered event
// finds nothing open on the closed groups). The deciders are told after the commit.
import { LockMode } from '@mikro-orm/core'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, eraseAddressDeliveries } from '@/modules/foundation'
import { Application, ApplicationLink, ConfirmationLink } from '../data/entities'
import { applicationTransitions, isDecidableState } from '../lib/states'
import { applicationTargets, clubDay, enrolmentSettings, type EnrolmentScope } from '../services/directory'
import { emailKey } from '../services/links'
import { announceClosedGroup } from '../services/places'
import { anonymiseApplications } from '../services/retention'
import { inWriteTransaction } from './shared'

const inputSchema = z.object({ closedGroupIds: z.array(z.uuid()).max(500) }).strict()

export type GroupClosedResult = { moved: number; groups: Array<{ sectionId: string; groupId: string }> }

const groupClosedCommand: CommandHandler<Record<string, unknown>, GroupClosedResult> = {
  id: 'enrolment.applications.group_closed',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'enrolment.applications.group_closed', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: inputSchema,
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
      const ids = authorized.parsed.closedGroupIds
      if (ids.length === 0) return { scope, moved: 0, groups: [] }
      const rows = await em.find(Application, {
        ...scope,
        deletedAt: null,
        groupId: { $in: ids },
        state: { $in: ['new', 'trial', 'waiting'] },
      })
      const now = new Date()
      const groups = new Map<string, { sectionId: string; groupId: string }>()
      for (const row of rows) {
        groups.set(row.groupId as string, { sectionId: row.sectionId, groupId: row.groupId as string })
        if (row.state === 'new') continue
        if (!applicationTransitions.canTransition(row.state, 'new')) continue
        row.state = 'new'
        row.waitingSince = null
        row.trialOccurrenceId = null
        row.trialOutcome = null
        row.updatedAt = now
      }
      await em.flush()
      return { scope, moved: rows.length, groups: [...groups.values()] }
    })
    const { scope: trusted, ...counts } = result
    if (result.groups.length > 0) {
      const today = clubDay(await enrolmentSettings(ctx.container, trusted))
      for (const { sectionId, groupId } of result.groups) {
        try {
          const target = (
            await applicationTargets(ctx.container, trusted, { sectionId, date: today, groupIds: [groupId] })
          ).at(0)
          await announceClosedGroup(ctx.container, trusted, {
            sectionId,
            groupId,
            groupName: target?.name ?? '—',
            today,
          })
        } catch {
          // The list shows the flag anyway; the notice is a convenience.
        }
      }
    }
    return counts
  },
}

registerCommand(groupClosedCommand)

// --- The applicant's erasure (applicant CLI `--erase`, REQ-J18) ---

const eraseSchema = z.object({ email: z.string().trim().min(3).max(254) }).strict()

export type EraseApplicantResult = {
  tenantId: string
  organizationId: string
  deleted: number
  withdrawn: number
  anonymised: number
  deliveries: number
}

/**
 * `enrolment.applications.erase_applicant` (operator only, job context): the address's unconfirmed applications are
 * deleted, its open ones withdrawn, and all of them anonymised at once (not after 30 days); the deliveries sent to the
 * address without a person record lose the address (`eraseAddressDeliveries`, Ask First approved on #788). An accepted
 * application's persons stay: they are club persons, erased through `people`.
 */
const eraseApplicantCommand: CommandHandler<Record<string, unknown>, EraseApplicantResult> = {
  id: 'enrolment.applications.erase_applicant',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'enrolment.applications.erase_applicant', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: eraseSchema,
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
      const email = authorized.parsed.email
      const rows = await em.find(
        Application,
        { ...scope, emailKey: emailKey(scope, email), deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      const now = new Date()
      const unconfirmed = rows.filter((row) => row.state === 'unconfirmed').map((row) => row.id)
      let withdrawn = 0
      for (const row of rows) {
        if (!isDecidableState(row.state)) continue
        row.state = 'withdrawn'
        row.waitingSince = null
        row.closedAt = now
        row.updatedAt = now
        withdrawn += 1
      }
      await em.flush()
      if (unconfirmed.length > 0) {
        await em.nativeDelete(ConfirmationLink, { ...scope, applicationId: { $in: unconfirmed } })
        await em.nativeDelete(ApplicationLink, { ...scope, applicationId: { $in: unconfirmed } })
        await em.nativeDelete(Application, { ...scope, id: { $in: unconfirmed } })
      }
      const kept = rows.filter((row) => row.state !== 'unconfirmed').map((row) => row.id)
      const anonymised = await anonymiseApplications(em, scope, kept, now)
      const deliveries = await eraseAddressDeliveries(em, scope, email)
      return { ...scope, deleted: unconfirmed.length, withdrawn, anonymised, deliveries }
    })
  },
  // The input is the address: keep it out of `action_logs`; the entry keeps the counts only.
  buildLog: ({ result }) => ({
    actionLabel: 'Erase an applicant by e-mail',
    resourceKind: 'enrolment.organization',
    resourceId: result.organizationId,
    tenantId: result.tenantId,
    organizationId: result.organizationId,
    context: {
      actingRole: 'system',
      deleted: result.deleted,
      withdrawn: result.withdrawn,
      anonymised: result.anonymised,
      deliveries: result.deliveries,
    },
    replayable: false,
  }),
}

registerCommand(eraseApplicantCommand)
