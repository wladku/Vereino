// The daily life-cycle job's work for one club (people life-cycle spec REQ-L06, REQ-L07, DD-L08, DD-L09, *Events, Jobs*
// steps 1–4; phase L8, #310). The rules are in `lib/life-cycle-rules.ts`; this service reads the candidates, writes
// one ward per transaction and sends the notices through the foundation dispatch:
//   1. T−30: `people.turns_18_soon` to the active guardians and the person (the foundation's minor rule: a minor is
//      reached directly only with an account) and `people.turns_18_soon_admin` to the club administrators;
//   2. the 18th birthday: the guardianships that started before it end the day before, the consents are copied to the
//      adult, `people.person.came_of_age` is emitted and `people.came_of_age` (+ `_admin`) is sent — the notices are
//      enqueued in the same transaction, so a ward is never changed without them; the payer role follows from the role
//      sync (`people:sync-auth-roles` on the guardianship events and the daily `people:sync-role-expiry`);
//   3. the account age: `people.account_age_reached` to the guardians and `…_admin` to the administrators, once per
//      person — any earlier account-age key counts, so a lowered threshold reaches only the newly eligible;
//   4. dated departures: the accounts of persons who left before today close (`closeDepartedAccounts`);
//   5. erasure step two (phase L6, #308): the name of an anonymised person whose retention hold ended before today is
//      cleared with the hold date (`clearHeldName`), one person per transaction, and the person reindexed.
// Every notice is "sent once" through its dispatch idempotency key; a person's failure is logged, reported as
// `people.life_cycle.failed` and retried by the next run. A dry run reads the same candidates and changes nothing.
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { ADULT_AGE, addDays, ageOn, type CalendarDate } from '@vereino/core'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import { Guardianship, Person } from '../data/entities'
import {
  ACCOUNT_AGE_REACHED_ADMIN_TEMPLATE,
  ACCOUNT_AGE_REACHED_TEMPLATE,
  CAME_OF_AGE_ADMIN_TEMPLATE,
  CAME_OF_AGE_TEMPLATE,
  TURNS_18_SOON_ADMIN_TEMPLATE,
  TURNS_18_SOON_TEMPLATE,
} from '../emails/templates'
import { emitPeopleEvent } from '../events'
import {
  TURNS_18_NOTICE_DAYS,
  accountAgeKey,
  accountAgeKeysUpTo,
  accountAgeReached,
  cameOfAgeKey,
  carriedOverConsents,
  eighteenthBirthday,
  guardianshipEndDay,
  guardianshipsEndingAt18,
  knownBirthDate,
  turns18Soon,
  turns18SoonKey,
} from '../lib/life-cycle-rules'
import { parseStoredConsents } from '../lib/people-rules'
import { yearsBefore } from '../lib/person-list-filters'
import { guardianshipEvents, personEvents, personIndexer } from '../commands/shared'
import { clubSettings, type ClubScope } from './club-clock'
import { closeDepartedAccounts } from './departure-accounts'
import { clearHeldName } from './erasure'
import { roleHolderIdsOn } from './person-directory'

const FOUNDATION_DISPATCH = 'foundationDispatch'

/** The administrators' version of a notice uses the family key with this suffix. */
const ADMIN_KEY_SUFFIX = ':admins'

export type LifeCycleCounts = {
  /** Step 1: persons told 30 days ahead (or, in a dry run, who would be). */
  turns18Soon: number
  /** Step 2: adults whose guardianships ended. */
  cameOfAge: number
  guardianshipsEnded: number
  /** Step 3: persons told about the account age. */
  accountAge: number
  /** Step 4: accounts of former persons closed. */
  accountsClosed: number
  /** Step 5: names of anonymised persons cleared after the retention hold (#308). */
  namesErased: number
  /** Persons whose step failed this run; the next run retries them. */
  failed: number
}

export type LifeCycleRun = {
  counts: LifeCycleCounts
  /** Wards with an active guardianship and no birth date: skipped and listed for the administrator. */
  withoutBirthDate: string[]
  /** The adults whose guardianships ended this run (ids only). */
  cameOfAgePersonIds: string[]
}

type JobScope = ClubScope

/** A person active on `today`: not deleted and not former (`left_on` not reached). */
function currentPersons(today: CalendarDate) {
  return { deletedAt: null, $or: [{ leftOn: null }, { leftOn: { $gt: today } }] }
}

function activeOn(today: CalendarDate) {
  return { validFrom: { $lte: today }, $or: [{ validTo: null }, { validTo: { $gte: today } }] }
}

type Notice = {
  template: string
  params: Record<string, unknown>
  personIds: readonly string[]
  exclude?: readonly string[]
  personId: string
  idempotencyKey: string
}

type EnqueuedNotice = { dispatchId: string | null; recipientIds: string[] }

/**
 * Enqueues one notice in the caller's transaction; the dispatch id when a new one was written (the caller publishes it
 * after the commit), null when nobody is reachable or the key was used before. Returns the reached person ids, so the
 * administrators' version can leave out a family member who is also an administrator.
 */
async function enqueueNotice(
  tx: EntityManager,
  container: AwilixContainer,
  scope: JobScope,
  notice: Notice,
): Promise<EnqueuedNotice> {
  const ids = [...new Set(notice.personIds)]
  if (ids.length === 0) return { dispatchId: null, recipientIds: [] }
  // The members are read on the caller's transaction, not on a second pooled connection (#836), on a fork with its
  // own identity map so the decrypted persons stay out of the transaction's.
  const reader = tx.fork({ keepTransactionContext: true })
  const context = { container, ...scope, scope: [{ kind: 'system_job' as const }], em: reader }
  const audience = await resolveMembers(
    ids.map((personId) => ({ personId, reason: 'direct' as const })),
    context,
    { exclude: notice.exclude },
  )
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) return { dispatchId: null, recipientIds: [] }
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const enqueued = await dispatch.enqueue(
    tx,
    {
      template: notice.template,
      params: notice.params,
      recipients,
      source: { module: 'people', type: 'people:person', id: notice.personId },
      idempotencyKey: notice.idempotencyKey,
      actor: { userId: null, actingRole: 'system' },
    },
    { ...context, em: tx },
  )
  return {
    dispatchId: enqueued.created ? enqueued.dispatchId : null,
    recipientIds: recipients.map((recipient) => recipient.personId),
  }
}

/** A notice to the family and its administrators' version, enqueued together in one transaction. */
async function enqueueFamilyAndAdmins(
  tx: EntityManager,
  container: AwilixContainer,
  scope: JobScope,
  input: {
    family: Omit<Notice, 'exclude'>
    adminTemplate: string
    adminIds: readonly string[]
  },
): Promise<string[]> {
  const family = await enqueueNotice(tx, container, scope, input.family)
  const admins = await enqueueNotice(tx, container, scope, {
    ...input.family,
    template: input.adminTemplate,
    personIds: input.adminIds,
    exclude: family.recipientIds,
    idempotencyKey: `${input.family.idempotencyKey}${ADMIN_KEY_SUFFIX}`,
  })
  return [family.dispatchId, admins.dispatchId].filter((id): id is string => id !== null)
}

async function publishAll(container: AwilixContainer, scope: JobScope, dispatchIds: readonly string[]) {
  if (dispatchIds.length === 0) return
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  for (const id of dispatchIds) await dispatch.publish(id, scope)
}

/** The keys among `keys` (family and administrators' versions) that were used before. */
async function usedKeys(container: AwilixContainer, scope: JobScope, keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  return dispatch.existingKeys(
    keys.flatMap((key) => [key, `${key}${ADMIN_KEY_SUFFIX}`]),
    scope,
  )
}

function told(used: ReadonlySet<string>, key: string): boolean {
  return used.has(key) || used.has(`${key}${ADMIN_KEY_SUFFIX}`)
}

/** The active guardians of each ward on `today`. */
async function activeGuardiansOf(
  em: EntityManager,
  scope: JobScope,
  wardIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (wardIds.length === 0) return result
  const rows = await em.find(
    Guardianship,
    { ...scope, ...activeOn(today), wardPersonId: { $in: [...wardIds] }, deletedAt: null },
    { fields: ['id', 'guardianPersonId', 'wardPersonId'] },
  )
  for (const row of rows) result.set(row.wardPersonId, [...(result.get(row.wardPersonId) ?? []), row.guardianPersonId])
  return result
}

type Options = {
  today: CalendarDate
  dryRun: boolean
  onFailure: (error: unknown, step: string) => void
}

type Reader = { em: EntityManager; admins: string[] }

/** Step 1: persons whose 18th birthday is within 30 days and who were not told. */
async function stepTurns18Soon(
  container: AwilixContainer,
  scope: JobScope,
  reader: Reader,
  options: Options,
): Promise<number> {
  const { today } = options
  const candidates = await findWithDecryption(
    reader.em,
    Person,
    {
      ...scope,
      ...currentPersons(today),
      birthDate: {
        $gt: yearsBefore(today, ADULT_AGE),
        $lte: yearsBefore(addDays(today, TURNS_18_NOTICE_DAYS), ADULT_AGE),
      },
    },
    { fields: ['id', 'firstName', 'birthDate'], orderBy: { id: 'asc' } },
    scope,
  )
  const due = candidates.filter((person) => {
    const birthDate = knownBirthDate(person.birthDate)
    return birthDate !== null && turns18Soon(birthDate, today)
  })
  const used = await usedKeys(
    container,
    scope,
    due.map((person) => turns18SoonKey(person.id)),
  )
  const pending = due.filter((person) => !told(used, turns18SoonKey(person.id)))
  if (options.dryRun) return pending.length
  const guardians = await activeGuardiansOf(
    reader.em,
    scope,
    pending.map((person) => person.id),
    today,
  )
  let notified = 0
  for (const person of pending) {
    try {
      const params = {
        personId: person.id,
        name: person.firstName,
        on: eighteenthBirthday(knownBirthDate(person.birthDate) as CalendarDate),
      }
      const em = container.resolve<EntityManager>('em').fork()
      const dispatchIds = await em.transactional((tx) =>
        enqueueFamilyAndAdmins(tx, container, scope, {
          family: {
            template: TURNS_18_SOON_TEMPLATE,
            params,
            personIds: [person.id, ...(guardians.get(person.id) ?? [])],
            personId: person.id,
            idempotencyKey: turns18SoonKey(person.id),
          },
          adminTemplate: TURNS_18_SOON_ADMIN_TEMPLATE,
          adminIds: reader.admins,
        }),
      )
      await publishAll(container, scope, dispatchIds)
      if (dispatchIds.length > 0) notified += 1
    } catch (error: unknown) {
      options.onFailure(error, 'turns_18_soon')
    }
  }
  return notified
}

/** Step 2 for one ward, in one transaction: end, copy, enqueue. Null when another run already did it. */
async function comeOfAge(
  ctx: CommandRuntimeContext,
  scope: JobScope,
  wardId: string,
  admins: readonly string[],
  today: CalendarDate,
): Promise<{ ended: Guardianship[]; person: Person; birthday: CalendarDate; dispatchIds: string[] } | null> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  return em.transactional(async (tx) => {
    const locked = await findWithDecryption(
      tx,
      Person,
      { id: wardId, ...scope, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
      scope,
    )
    const person = locked.length > 0 ? locked[0] : null
    const birthDate = knownBirthDate(person?.birthDate)
    if (!person || !birthDate) return null
    const rows = await tx.find(
      Guardianship,
      { ...scope, wardPersonId: wardId, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
    )
    const ending = guardianshipsEndingAt18(
      birthDate,
      rows.map((row) => ({
        id: row.id,
        guardianPersonId: row.guardianPersonId,
        validFrom: row.validFrom,
        validTo: row.validTo ?? null,
        consents: parseStoredConsents(row.consents),
        row,
      })),
      today,
    )
    if (ending.length === 0) return null
    const endDay = guardianshipEndDay(birthDate)
    const now = new Date()
    for (const { row } of ending) {
      row.validTo = endDay
      row.updatedAt = now
    }
    const carried = carriedOverConsents(
      parseStoredConsents(person.consents),
      ending.map((entry) => entry.consents),
    )
    if (carried.copied.length > 0) person.consents = carried.consents
    person.updatedAt = now
    await tx.flush()
    const birthday = eighteenthBirthday(birthDate)
    const dispatchIds = await enqueueFamilyAndAdmins(tx, ctx.container, scope, {
      family: {
        template: CAME_OF_AGE_TEMPLATE,
        params: { personId: person.id, name: person.firstName, on: birthday },
        // The former guardians by name: their guardianship has just ended, so the minor rule no longer reaches them.
        personIds: [person.id, ...ending.map((entry) => entry.guardianPersonId)],
        personId: person.id,
        idempotencyKey: cameOfAgeKey(person.id),
      },
      adminTemplate: CAME_OF_AGE_ADMIN_TEMPLATE,
      adminIds: admins,
    })
    return { ended: ending.map((entry) => entry.row), person, birthday, dispatchIds }
  })
}

/** Step 2: adults with a guardianship that started before their 18th birthday and is still active. */
async function stepCameOfAge(
  ctx: CommandRuntimeContext,
  scope: JobScope,
  reader: Reader,
  options: Options,
  run: LifeCycleRun,
): Promise<void> {
  const { today } = options
  const links = await reader.em.find(
    Guardianship,
    { ...scope, ...activeOn(today), deletedAt: null },
    { fields: ['id', 'wardPersonId', 'guardianPersonId', 'validFrom', 'validTo'], orderBy: { wardPersonId: 'asc' } },
  )
  const wardIds = [...new Set(links.map((row) => row.wardPersonId))]
  if (wardIds.length === 0) return
  const wards = await reader.em.find(
    Person,
    { ...scope, id: { $in: wardIds }, deletedAt: null },
    { fields: ['id', 'birthDate'] },
  )
  const due: string[] = []
  for (const ward of wards) {
    const birthDate = knownBirthDate(ward.birthDate)
    if (!birthDate) {
      run.withoutBirthDate.push(ward.id)
      continue
    }
    const ending = guardianshipsEndingAt18(
      birthDate,
      links
        .filter((row) => row.wardPersonId === ward.id)
        .map((row) => ({ ...row, validTo: row.validTo ?? null, consents: {} })),
      today,
    )
    if (ending.length === 0) continue
    due.push(ward.id)
    if (options.dryRun) {
      run.counts.cameOfAge += 1
      run.counts.guardianshipsEnded += ending.length
    }
  }
  run.withoutBirthDate.sort()
  if (options.dryRun) return
  for (const wardId of due.sort()) {
    try {
      const outcome = await comeOfAge(ctx, scope, wardId, reader.admins, today)
      if (!outcome) continue
      run.counts.cameOfAge += 1
      run.counts.guardianshipsEnded += outcome.ended.length
      run.cameOfAgePersonIds.push(wardId)
      await publishAll(ctx.container, scope, outcome.dispatchIds)
      const dataEngine = ctx.container.resolve<DataEngine>('dataEngine')
      for (const row of outcome.ended) {
        await emitCrudSideEffects({
          dataEngine,
          action: 'updated',
          entity: row,
          identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
          events: guardianshipEvents,
        })
      }
      await emitCrudSideEffects({
        dataEngine,
        action: 'updated',
        entity: outcome.person,
        identifiers: { id: wardId, ...scope },
        events: personEvents,
        indexer: personIndexer,
      })
      await emitPeopleEvent(
        'people.person.came_of_age',
        { id: wardId, ...scope, birthday: outcome.birthday },
        { persistent: true, ...scope },
      )
    } catch (error: unknown) {
      options.onFailure(error, 'came_of_age')
    }
  }
}

/** Step 3: minors without an account whose age reached the club's account age and who were not told. */
async function stepAccountAge(
  container: AwilixContainer,
  scope: JobScope,
  reader: Reader,
  options: Options,
): Promise<number> {
  const { today } = options
  const { ownAccountMinAge: threshold } = await clubSettings(container, scope)
  if (threshold >= ADULT_AGE) return 0
  const candidates = await findWithDecryption(
    reader.em,
    Person,
    {
      ...scope,
      ...currentPersons(today),
      userId: null,
      birthDate: { $lte: yearsBefore(today, threshold), $gt: yearsBefore(today, ADULT_AGE) },
    },
    { fields: ['id', 'firstName', 'birthDate', 'userId'], orderBy: { id: 'asc' } },
    scope,
  )
  const due = candidates.flatMap((person) => {
    const birthDate = knownBirthDate(person.birthDate)
    if (!birthDate || !accountAgeReached({ birthDate, threshold, hasAccount: Boolean(person.userId), today })) return []
    return [{ person, age: ageOn(birthDate, today) }]
  })
  const used = await usedKeys(
    container,
    scope,
    due.flatMap(({ person, age }) => accountAgeKeysUpTo(person.id, age)),
  )
  const pending = due.filter(({ person, age }) => !accountAgeKeysUpTo(person.id, age).some((key) => told(used, key)))
  if (options.dryRun) return pending.length
  const guardians = await activeGuardiansOf(
    reader.em,
    scope,
    pending.map(({ person }) => person.id),
    today,
  )
  let notified = 0
  for (const { person } of pending) {
    try {
      const em = container.resolve<EntityManager>('em').fork()
      const dispatchIds = await em.transactional((tx) =>
        enqueueFamilyAndAdmins(tx, container, scope, {
          family: {
            template: ACCOUNT_AGE_REACHED_TEMPLATE,
            params: { personId: person.id, name: person.firstName, threshold },
            personIds: guardians.get(person.id) ?? [],
            personId: person.id,
            idempotencyKey: accountAgeKey(person.id, threshold),
          },
          adminTemplate: ACCOUNT_AGE_REACHED_ADMIN_TEMPLATE,
          adminIds: reader.admins,
        }),
      )
      await publishAll(container, scope, dispatchIds)
      if (dispatchIds.length > 0) notified += 1
    } catch (error: unknown) {
      options.onFailure(error, 'account_age')
    }
  }
  return notified
}

/** Step 4 in a dry run: the accounts that would close. */
async function countDepartedAccounts(reader: Reader, scope: JobScope, today: CalendarDate): Promise<number> {
  return reader.em.count(Person, { ...scope, deletedAt: null, userId: { $ne: null }, leftOn: { $lt: today } })
}

/** Runs steps 1–4 for one club on `today`; with `dryRun` only counts. */
export async function runLifeCycle(
  ctx: CommandRuntimeContext,
  scope: JobScope,
  options: Options,
): Promise<LifeCycleRun> {
  const run: LifeCycleRun = {
    counts: {
      turns18Soon: 0,
      cameOfAge: 0,
      guardianshipsEnded: 0,
      accountAge: 0,
      accountsClosed: 0,
      namesErased: 0,
      failed: 0,
    },
    withoutBirthDate: [],
    cameOfAgePersonIds: [],
  }
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const reader: Reader = { em, admins: await roleHolderIdsOn(em, scope, 'club_admin', options.today) }
  const step: Options = {
    ...options,
    onFailure: (error, name) => {
      run.counts.failed += 1
      options.onFailure(error, name)
    },
  }
  run.counts.turns18Soon = await stepTurns18Soon(ctx.container, scope, reader, step)
  await stepCameOfAge(ctx, scope, reader, step, run)
  run.counts.accountAge = await stepAccountAge(ctx.container, scope, reader, step)
  if (options.dryRun) {
    run.counts.accountsClosed = await countDepartedAccounts(reader, scope, options.today)
  } else {
    const accounts = await closeDepartedAccounts(ctx, scope, options.today, (error) => {
      options.onFailure(error, 'departed_accounts')
    })
    run.counts.accountsClosed = accounts.closed
    run.counts.failed += accounts.failed
  }
  run.counts.namesErased = await stepErasureNames(ctx, scope, reader, step)
  return run
}

/**
 * Step 5 (DD-L07; #308): the names whose retention hold ended before `today` (missed days caught up: `<`). Each person
 * is cleared in its own transaction under a row lock, re-checked there, so a concurrent run clears it once. A dry run
 * counts.
 */
async function stepErasureNames(
  ctx: CommandRuntimeContext,
  scope: JobScope,
  reader: Reader,
  options: Options,
): Promise<number> {
  const due = await reader.em.find(
    Person,
    { ...scope, deletedAt: null, anonymizedAt: { $ne: null }, erasureHoldUntil: { $lt: options.today } },
    { fields: ['id'] },
  )
  if (options.dryRun) return due.length
  let erased = 0
  for (const { id } of due) {
    try {
      const em = ctx.container.resolve<EntityManager>('em').fork()
      const person = await em.transactional(async (tx) => {
        const row = await tx.findOne(
          Person,
          { id, ...scope, deletedAt: null, anonymizedAt: { $ne: null }, erasureHoldUntil: { $lt: options.today } },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        )
        if (!row) return null
        clearHeldName(row, new Date())
        await tx.flush()
        return row
      })
      if (!person) continue
      erased += 1
      await emitCrudSideEffects({
        dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
        action: 'updated',
        entity: person,
        identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
        events: personEvents,
        indexer: personIndexer,
      })
    } catch (error: unknown) {
      options.onFailure(error, 'erasure_names')
    }
  }
  return erased
}
