// Leaving the club (people life-cycle spec REQ-L03, DD-L03…DD-L05, *API* rows `people.persons.depart` and
// `people.persons.return`; J-L02; phase L4, #306). The club administrator previews a departure (what ends, the
// blockers, the payer hand-overs) and confirms it with the preview token; one transaction ends the persons' role
// assignments and guardianships on the last day (rows that would only start later are removed), hands the primary
// payer of a staying ward to the named guardian from the day after, sets `left_on`, lets every registered contributor
// end its records (`people.departure.<module>`, e.g. the `groups` memberships) and closes the open requests of the
// persons. The accounts close the day after the last day (the daily role sync, `services/departure-accounts.ts`). The
// departure is undoable until its last day (Q-L20); "Return to the club" clears `left_on` and restores nothing else.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { addDays, type ActingRole, type CalendarDate } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { DepartureRequest, Guardianship, Person, RoleAssignment } from '../data/entities'
import { departurePreviewSchema, departureSchema, personReturnSchema } from '../data/validators'
import { emitPeopleEvent } from '../events'
import { isDepartureDateInPast, isDepartureUndoExpired, missingPayerChoices } from '../lib/departure-rules'
import { checkPreviewToken, issuePreviewToken } from '../lib/departure-token'
import { clubToday } from '../services/club-clock'
import {
  departureContributors,
  type DepartureChange,
  type DepartureContributorModule,
  type DepartureSubject,
} from '../services/departure'
import { notifyDepartureConfirmed } from '../services/departure-notices'
import { buildDeparturePlan, planBindingContent, type DeparturePlan } from '../services/departure-plan'
import {
  actorPersonId,
  guardianshipEvents,
  inWriteTransaction,
  isUniqueViolation,
  loadPersonLocked,
  lockPerson,
  personEvents,
  personIndexer,
  personTarget,
  roleAssignmentEvents,
} from './shared'

const logger = createLogger('people').child({ component: 'departures' })

const RESOURCE_KIND = 'people.person'
const MANAGE_KINDS = ['club_admin'] as const

type ClubScope = { tenantId: string; organizationId: string }

/** A `people` row the departure ended or removed, as it was before. */
type RowSnapshot = { id: string; validTo: CalendarDate | null; removed: boolean }

/** Everything the undo needs (`snapshotBefore` of the audit entry). Ids and dates only. */
export type DepartureSnapshot = {
  departureId: string
  tenantId: string
  organizationId: string
  personIds: string[]
  lastDay: CalendarDate
  persons: Array<{ id: string; leftOn: CalendarDate | null }>
  roleAssignments: RowSnapshot[]
  guardianships: RowSnapshot[]
  /** Payer hand-overs: the next payer's row ended on the last day and the new primary-payer row created after it. */
  payerSplits: Array<{
    endedId: string
    validTo: CalendarDate | null
    createdId: string | null
    flagOnlyId: string | null
  }>
  requestIds: string[]
  contributors: Partial<Record<DepartureContributorModule, unknown>>
}

export type DepartureCommandResult = {
  snapshot: DepartureSnapshot
  actingRole: ActingRole
  changes: Partial<Record<DepartureContributorModule, DepartureChange[]>>
  summary: { persons: number; ended: number }
}

export type DeparturePreviewResult = { plan: DeparturePlan; previewToken: string; today: CalendarDate }

/** A person of the club as the departure's scope target (the club administrator's grant is club-wide). */
function departureSpec<TSchema extends z.ZodType<{ personIds: string[] }>>(input: TSchema, ctx: CommandRuntimeContext) {
  return {
    input,
    resourceKind: RESOURCE_KIND,
    allowedKinds: MANAGE_KINDS,
    loadTarget: (parsed: { personIds: string[] }, em: EntityManager, lock: Parameters<typeof loadPersonLocked>[3]) =>
      loadPersonLocked(em, ctx, parsed.personIds[0], lock),
    resolveTarget: (_parsed: unknown, entity: Person | null) => personTarget(entity as Person),
    lock: 'none' as const,
  }
}

/**
 * The preview (`POST /api/people/departures/preview`): authorized like the departure, read in a transaction that
 * writes nothing; the token binds the scope, the actor, the input and the plan (*Security*, 15 minutes).
 */
export async function previewDeparture(
  ctx: CommandRuntimeContext,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<DeparturePreviewResult> {
  return inWriteTransaction(ctx, 'people.persons.depart.preview', async (em) => {
    const authorized = await authorizeScoped(departureSpec(departurePreviewSchema, ctx), rawInput, ctx, em)
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const { personIds, lastDay } = authorized.parsed
    const today = await clubToday(ctx.container, scope, now)
    if (isDepartureDateInPast(lastDay, today)) await peopleErrors.throw('departure_date_in_past', { field: 'lastDay' })
    const plan = await buildDeparturePlan(em, ctx.container, scope, { personIds, lastDay, today })
    if (!plan) return throwNotFound()
    const previewToken = issuePreviewToken(
      { ...scope, actorUserId: ctx.auth?.sub ?? '', personIds, lastDay, content: planBindingContent(plan) },
      now.getTime(),
    )
    return { plan, previewToken, today }
  })
}

async function throwNotFound(): Promise<never> {
  const { translate } = await resolveTranslations()
  throw notFound(translate('foundation.errors.not_found', 'Not found'))
}

/** Ends (`valid_to` = last day) or removes (soft delete) a row, returning what it was. */
function endRow(row: RoleAssignment | Guardianship, lastDay: CalendarDate): RowSnapshot {
  const before: RowSnapshot = { id: row.id, validTo: row.validTo ?? null, removed: false }
  if (row.validFrom > lastDay) {
    row.deletedAt = new Date()
    before.removed = true
  } else {
    row.validTo = lastDay
  }
  row.updatedAt = new Date()
  return before
}

/**
 * The payer hand-over (*Primary payer hand-over*): the named staying guardian becomes the primary payer from the day
 * after the last day — their current row ends on the last day and a copy with the flag starts the next day (a row that
 * starts after the last day just gets the flag). The leaving payer's own row has already ended.
 */
async function handOverPayer(
  em: EntityManager,
  scope: ClubScope,
  entry: { wardPersonId: string; guardianPersonId: string },
  lastDay: CalendarDate,
): Promise<DepartureSnapshot['payerSplits'][number] | null> {
  const rows = await em.find(Guardianship, {
    ...scope,
    wardPersonId: entry.wardPersonId,
    guardianPersonId: entry.guardianPersonId,
    deletedAt: null,
    $or: [{ validTo: null }, { validTo: { $gt: lastDay } }],
  })
  const row = rows[0]
  if (!row || row.isPrimaryPayer) return null
  if (row.validFrom > lastDay) {
    row.isPrimaryPayer = true
    row.updatedAt = new Date()
    return { endedId: row.id, validTo: row.validTo ?? null, createdId: null, flagOnlyId: row.id }
  }
  const validTo = row.validTo ?? null
  row.validTo = lastDay
  row.updatedAt = new Date()
  // The ended rows reach the database before the new open-ended primary-payer row (partial unique index).
  await em.flush()
  const created = em.create(Guardianship, {
    id: randomUUID(),
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    guardianPersonId: row.guardianPersonId,
    wardPersonId: row.wardPersonId,
    relation: row.relation,
    isPrimaryPayer: true,
    consents: row.consents,
    validFrom: addDays(lastDay, 1),
    validTo,
  })
  em.persist(created)
  return { endedId: row.id, validTo, createdId: created.id, flagOnlyId: null }
}

async function emitRows(
  ctx: CommandRuntimeContext,
  rows: ReadonlyArray<RoleAssignment | Guardianship | Person>,
  action: 'created' | 'updated' | 'deleted',
  config: 'role' | 'guardianship' | 'person',
  undo: boolean,
): Promise<void> {
  const dataEngine = ctx.container.resolve<DataEngine>('dataEngine')
  for (const row of rows) {
    const args = {
      dataEngine,
      action,
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      ...(config === 'role'
        ? { events: roleAssignmentEvents }
        : config === 'guardianship'
          ? { events: guardianshipEvents }
          : { events: personEvents, indexer: personIndexer }),
    }
    // The configs are typed per entity; the row matches the config it is emitted with.
    if (undo) await emitCrudUndoSideEffects(args as Parameters<typeof emitCrudUndoSideEffects>[0])
    else await emitCrudSideEffects(args as Parameters<typeof emitCrudSideEffects>[0])
  }
}

/** Contributors' after-commit side effects; a failure is logged and reported, never rolled back. */
async function contributorsAfterCommit(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  changes: Partial<Record<DepartureContributorModule, DepartureChange[]>>,
  undo: boolean,
): Promise<void> {
  for (const { module, contributor } of departureContributors(ctx.container)) {
    const moduleChanges = changes[module]
    if (!moduleChanges || moduleChanges.length === 0) continue
    try {
      await contributor.afterCommit(moduleChanges, { container: ctx.container, ...scope }, undo)
    } catch (error: unknown) {
      logger.warn('A departure contributor failed after the commit', { module, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.departure.after_commit_failed' })
    }
  }
}

const departCommand: CommandHandler<Record<string, unknown>, DepartureCommandResult> = {
  id: 'people.persons.depart',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const departureId = randomUUID()
    const written = { roles: [] as RoleAssignment[], guardianships: [] as Guardianship[] }
    const result = await mapPayerViolation(() =>
      inWriteTransaction(ctx, 'people.persons.depart', async (em) => {
        const authorized = await authorizeScoped(departureSpec(departureSchema, ctx), rawInput, ctx, em)
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        const input = authorized.parsed
        const personIds = [...new Set(input.personIds)].sort()
        // Row locks in a fixed order serialize concurrent departures, guardianship and role writes of these persons.
        for (const personId of personIds) {
          if (!(await lockPerson(em, scope, personId))) return throwNotFound()
        }
        const today = await clubToday(ctx.container, scope)
        if (isDepartureDateInPast(input.lastDay, today)) {
          await peopleErrors.throw('departure_date_in_past', { field: 'lastDay' })
        }
        const plan = await buildDeparturePlan(em, ctx.container, scope, { personIds, lastDay: input.lastDay, today })
        if (!plan) return throwNotFound()
        const binding = {
          ...scope,
          actorUserId: ctx.auth?.sub ?? '',
          personIds,
          lastDay: input.lastDay,
          content: planBindingContent(plan),
        }
        if (checkPreviewToken(input.previewToken, binding, Date.now()) !== 'valid') {
          await peopleErrors.throw('departure_preview_stale')
        }
        const blockers = plan.persons.flatMap((person) => person.blockers)
        if (blockers.some((blocker) => blocker.code === 'last_club_admin')) await peopleErrors.throw('last_club_admin')
        if (blockers.length > 0) await peopleErrors.throw('departure_blocked', { blockers })
        const choices = plan.persons.flatMap((person) => person.choicesNeeded)
        const missing = missingPayerChoices(choices, input.nextPayer ?? [])
        if (missing.length > 0) await peopleErrors.throw('departure_payer_required', { wardPersonIds: missing })

        const snapshot: DepartureSnapshot = {
          departureId,
          ...scope,
          personIds,
          lastDay: input.lastDay,
          persons: [],
          roleAssignments: plan.roleAssignments.map((row) => endRow(row, input.lastDay)),
          guardianships: plan.guardianships.map((row) => endRow(row, input.lastDay)),
          payerSplits: [],
          requestIds: [],
          contributors: {},
        }
        written.roles.push(...plan.roleAssignments)
        written.guardianships.push(...plan.guardianships)
        await em.flush()
        for (const choice of choices) {
          const answer = (input.nextPayer ?? []).find((entry) => entry.wardPersonId === choice.wardPersonId)
          if (!answer) continue
          const split = await handOverPayer(em, scope, answer, input.lastDay)
          await em.flush()
          if (split) snapshot.payerSplits.push(split)
        }
        const persons = await em.find(Person, { ...scope, id: { $in: personIds }, deletedAt: null })
        for (const person of persons) {
          snapshot.persons.push({ id: person.id, leftOn: person.leftOn ?? null })
          person.leftOn = input.lastDay
          person.updatedAt = new Date()
        }
        await em.flush()
        const subject: DepartureSubject = { ...scope, personIds, lastDay: input.lastDay }
        const changes: DepartureCommandResult['changes'] = {}
        for (const { module, contributor } of departureContributors(ctx.container)) {
          const applied = await contributor.apply(em, subject, {})
          snapshot.contributors[module] = applied.snapshot
          changes[module] = applied.changes
        }
        const requests = await em.find(DepartureRequest, {
          ...scope,
          subjectPersonId: { $in: personIds },
          status: 'open',
          deletedAt: null,
        })
        const actor = actorPersonId(authorized.scope)
        for (const request of requests) {
          request.status = 'done'
          request.decidedByPersonId = actor
          request.decidedAt = new Date()
          request.updatedAt = new Date()
          snapshot.requestIds.push(request.id)
        }
        await em.flush()
        const ended = persons.length + snapshot.roleAssignments.length + snapshot.guardianships.length
        const contributed = Object.values(changes).reduce((sum, list) => sum + (list?.length ?? 0), 0)
        return {
          snapshot,
          actingRole: authorized.actingRole,
          changes,
          summary: { persons: persons.length, ended: ended - persons.length + contributed },
          persons,
        }
      }),
    )
    const scope = { tenantId: result.snapshot.tenantId, organizationId: result.snapshot.organizationId }
    await emitRows(ctx, written.roles, 'updated', 'role', false)
    await emitRows(ctx, written.guardianships, 'updated', 'guardianship', false)
    await emitRows(ctx, result.persons, 'updated', 'person', false)
    await contributorsAfterCommit(ctx, scope, result.changes, false)
    for (const personId of result.snapshot.personIds) {
      await emitPeopleEvent(
        'people.person.departed',
        { id: personId, ...scope, lastDay: result.snapshot.lastDay, departureId: result.snapshot.departureId },
        { persistent: true, ...scope },
      )
    }
    await emitCreatedGuardianships(ctx, scope, result.snapshot)
    try {
      await notifyDepartureConfirmed(ctx.container, scope, {
        departureId: result.snapshot.departureId,
        personIds: result.snapshot.personIds,
        lastDay: result.snapshot.lastDay,
      })
    } catch (error: unknown) {
      logger.warn('The departure confirmation could not be sent', { err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.departure.notice_failed' })
    }
    return {
      snapshot: result.snapshot,
      actingRole: result.actingRole,
      changes: result.changes,
      summary: result.summary,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    const { snapshot } = result
    return {
      actionLabel: translate('people.audit.persons.depart', 'Leaving the club'),
      resourceKind: RESOURCE_KIND,
      resourceId: snapshot.personIds[0],
      tenantId: snapshot.tenantId,
      organizationId: snapshot.organizationId,
      snapshotBefore: snapshot,
      context: {
        actingRole: result.actingRole,
        personIds: snapshot.personIds,
        lastDay: snapshot.lastDay,
        ended: result.summary.ended,
      },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeDepartureReplay(ctx, logEntry.snapshotBefore as DepartureSnapshot | null | undefined)
  },
  async undo({ ctx, logEntry }) {
    const snapshot = logEntry.snapshotBefore as DepartureSnapshot | null | undefined
    const em = await authorizeDepartureReplay(ctx, snapshot)
    const before = snapshot as DepartureSnapshot
    const scope = { tenantId: before.tenantId, organizationId: before.organizationId }
    const today = await clubToday(ctx.container, scope)
    if (isDepartureUndoExpired(before.lastDay, today)) await peopleErrors.throw('departure_undo_expired')
    const restored = await restoreDeparture(em, ctx, before)
    await emitRows(ctx, restored.roles, 'updated', 'role', true)
    await emitRows(ctx, restored.guardianships, 'updated', 'guardianship', true)
    await emitRows(ctx, restored.removedCopies, 'deleted', 'guardianship', true)
    await emitRows(ctx, restored.persons, 'updated', 'person', true)
    await contributorsAfterCommit(ctx, scope, restored.changes, true)
  },
}

/** `people.guardianship.created` for the payer copies (the `payments` payer rule listens to it, #295). */
async function emitCreatedGuardianships(ctx: CommandRuntimeContext, scope: ClubScope, snapshot: DepartureSnapshot) {
  const ids = snapshot.payerSplits.flatMap((split) => (split.createdId ? [split.createdId] : []))
  const flagged = snapshot.payerSplits.flatMap((split) => (split.flagOnlyId ? [split.flagOnlyId] : []))
  if (ids.length === 0 && flagged.length === 0) return
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const rows = await em.find(Guardianship, { ...scope, id: { $in: [...ids, ...flagged] } })
  await emitRows(
    ctx,
    rows.filter((row) => ids.includes(row.id)),
    'created',
    'guardianship',
    false,
  )
  await emitRows(
    ctx,
    rows.filter((row) => flagged.includes(row.id)),
    'updated',
    'guardianship',
    false,
  )
}

/** The partial unique index on the open-ended primary payer backs the hand-over: its violation is 409. */
async function mapPayerViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return peopleErrors.throw('guardianship_primary_payer_conflict')
    throw error
  }
}

/** The undo and redo are the club administrator's, in the replay transaction. */
async function authorizeDepartureReplay(
  ctx: CommandRuntimeContext,
  snapshot: DepartureSnapshot | null | undefined,
): Promise<EntityManager> {
  const em = ctx.transactionalEm
  if (!em || !snapshot?.personIds?.length)
    throw new Error('[internal] departure replay needs the transaction and the snapshot')
  await authorizeScoped(
    departureSpec(z.object({ personIds: z.array(z.uuid()).min(1) }), ctx),
    { personIds: snapshot.personIds },
    ctx,
    em,
    { mode: 'replay' },
  )
  return em
}

/**
 * Restores what the departure wrote, each value only where it is still the one the departure wrote (a row changed
 * since is left alone), and calls each contributor's `undo`. Runs in the replay transaction.
 */
async function restoreDeparture(em: EntityManager, ctx: CommandRuntimeContext, before: DepartureSnapshot) {
  const scope = { tenantId: before.tenantId, organizationId: before.organizationId }
  for (const personId of [...before.personIds].sort()) await lockPerson(em, scope, personId)
  const restoreRows = async <T extends RoleAssignment | Guardianship>(
    entity: typeof RoleAssignment | typeof Guardianship,
    snapshots: readonly RowSnapshot[],
  ): Promise<T[]> => {
    if (snapshots.length === 0) return []
    const rows = (await em.find(entity as typeof RoleAssignment, {
      ...scope,
      id: { $in: snapshots.map((row) => row.id) },
    })) as unknown as T[]
    const restored: T[] = []
    for (const row of rows) {
      const snap = snapshots.find((entry) => entry.id === row.id) as RowSnapshot
      if (snap.removed ? row.deletedAt === null : row.validTo !== before.lastDay) continue
      if (snap.removed) row.deletedAt = null
      else row.validTo = snap.validTo
      row.updatedAt = new Date()
      restored.push(row)
    }
    await em.flush()
    return restored
  }
  // The payer copies go first, so the restored open-ended primary payer does not meet them in the unique index.
  const removedCopies: Guardianship[] = []
  const createdIds = before.payerSplits.flatMap((split) => (split.createdId ? [split.createdId] : []))
  if (createdIds.length > 0) {
    for (const row of await em.find(Guardianship, { ...scope, id: { $in: createdIds }, deletedAt: null })) {
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      removedCopies.push(row)
    }
  }
  const flagged = before.payerSplits.flatMap((split) => (split.flagOnlyId ? [split.flagOnlyId] : []))
  if (flagged.length > 0) {
    for (const row of await em.find(Guardianship, { ...scope, id: { $in: flagged } })) {
      row.isPrimaryPayer = false
      row.updatedAt = new Date()
    }
  }
  await em.flush()
  const splitEnded: RowSnapshot[] = before.payerSplits
    .filter((split) => split.createdId)
    .map((split) => ({ id: split.endedId, validTo: split.validTo, removed: false }))
  const roles = await restoreRows<RoleAssignment>(RoleAssignment, before.roleAssignments)
  const guardianships = await restoreRows<Guardianship>(Guardianship, [...before.guardianships, ...splitEnded])
  const persons = await em.find(Person, { ...scope, id: { $in: before.personIds }, deletedAt: null })
  for (const person of persons) {
    if (person.leftOn !== before.lastDay) continue
    person.leftOn = before.persons.find((entry) => entry.id === person.id)?.leftOn ?? null
    person.updatedAt = new Date()
  }
  if (before.requestIds.length > 0) {
    const requests = await em.find(DepartureRequest, { ...scope, id: { $in: before.requestIds }, status: 'done' })
    for (const request of requests) {
      request.status = 'open'
      request.decidedByPersonId = null
      request.decidedAt = null
      request.updatedAt = new Date()
    }
  }
  await em.flush()
  const subject: DepartureSubject = { ...scope, personIds: before.personIds, lastDay: before.lastDay }
  const changes: Partial<Record<DepartureContributorModule, DepartureChange[]>> = {}
  for (const { module, contributor } of departureContributors(ctx.container)) {
    if (!(module in before.contributors)) continue
    changes[module] = await contributor.undo(em, subject, before.contributors[module])
  }
  await em.flush()
  return { roles, guardianships, removedCopies, persons, changes }
}

export type ReturnCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  leftOn: CalendarDate
  actingRole: ActingRole
}

/**
 * `people.persons.return` — "Return to the club" (*Former person*): clears `left_on`; memberships, roles and
 * guardianships are not restored (the person gets new ones). 409 `person_not_left` for a person who has not left.
 * Undoable: the undo sets the day again.
 */
const returnCommand: CommandHandler<Record<string, unknown>, ReturnCommandResult> = {
  id: 'people.persons.return',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.persons.return', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: personReturnSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
          resolveTarget: (_parsed, entity) => personTarget(entity as Person),
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const person = authorized.entity as Person
      if (!person.leftOn) return peopleErrors.throw('person_not_left')
      const leftOn = person.leftOn
      person.leftOn = null
      person.updatedAt = new Date()
      return { person, leftOn, actingRole: authorized.actingRole }
    })
    await emitRows(ctx, [result.person], 'updated', 'person', false)
    return {
      personId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      leftOn: result.leftOn,
      actingRole: result.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.return', 'Return to the club'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      snapshotBefore: { id: result.personId, leftOn: result.leftOn },
      context: { actingRole: result.actingRole, leftOn: result.leftOn },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReturnReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const person = await authorizeReturnReplay(ctx, logEntry.resourceId)
    const before = logEntry.snapshotBefore as { leftOn?: CalendarDate } | null | undefined
    if (!before?.leftOn || person.leftOn) return
    person.leftOn = before.leftOn
    person.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitRows(ctx, [person], 'updated', 'person', true)
  },
}

async function authorizeReturnReplay(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Person> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] return replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    {
      input: personReturnSchema,
      resourceKind: RESOURCE_KIND,
      allowedKinds: MANAGE_KINDS,
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, entity) => personTarget(entity as Person),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Person
}

registerCommand(departCommand)
registerCommand(returnCommand)
