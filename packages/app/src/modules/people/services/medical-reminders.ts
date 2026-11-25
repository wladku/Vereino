// The daily `people:medical-reminders` job's work for one club (training outlines and medical expiry spec REQ-O03,
// REQ-O04, BR-O1, DD-O04, retention R20; #682). The date is encrypted without a hash, so the job loads the club's live
// persons that have one and decides in memory (`lib/medical.ts`), one person per transaction under its row lock:
//   1. no `medical` consent in force (a withdrawal the commands missed, an ended guardianship, an adult 30 days past
//      the 18th birthday without an own consent) → the date is cleared;
//   2. the person left the club before today, or the date passed 12 months ago without renewal (R20) → cleared;
//   3. a month before the date and on the date → `people.medical_expiring` / `people.medical_expired` to the active
//      guardians of a minor, or to the adult, through the foundation dispatch (in-app and e-mail). The key
//      `medical:{personId}:{validUntil}:{kind}` sends each once; a changed date restarts them; a missed day is caught up
//      within `MEDICAL_REMINDER_LOOKBACK_DAYS`.
// A person's failure is reported and retried by the next run. A dry run counts and changes nothing.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isActiveAt, type CalendarDate } from '@vereino/core'
import { resolveMembers, type DispatchService } from '@/modules/foundation'
import { Guardianship, Person } from '../data/entities'
import { MEDICAL_EXPIRED_TEMPLATE, MEDICAL_EXPIRING_TEMPLATE } from '../emails/templates'
import { decideMedical, medicalReminderKey, type MedicalGuardianRow, type MedicalReminderKind } from '../lib/medical'
import { holdsOwnConsents, parseStoredConsents } from '../lib/people-rules'
import type { ClubScope } from './club-clock'
import { emitMedicalUpdated } from './medical'

const FOUNDATION_DISPATCH = 'foundationDispatch'

const CLEAR_COUNTS = {
  no_consent: 'clearedNoConsent',
  retention: 'clearedRetention',
  departed: 'clearedDeparted',
} as const

export type MedicalRemindersCounts = {
  /** Reminders sent (or, in a dry run, due and not sent before). */
  reminded: number
  /** Dates cleared because no `medical` consent is in force. */
  clearedNoConsent: number
  /** Dates cleared 12 months after they passed (R20). */
  clearedRetention: number
  /** Dates of persons who left the club, cleared after their last day (R20). */
  clearedDeparted: number
  /** Persons whose step failed this run; the next run retries them. */
  failed: number
}

type Options = {
  today: CalendarDate
  dryRun: boolean
  onFailure: (error: unknown, step: string) => void
}

/** The person's fields the decision reads, with the consents parsed. */
function medicalFacts(person: Pick<Person, 'birthDate' | 'consents' | 'medicalValidUntil' | 'leftOn'>) {
  return {
    birthDate: person.birthDate,
    consents: parseStoredConsents(person.consents),
    medicalValidUntil: person.medicalValidUntil,
    leftOn: person.leftOn,
  }
}

async function guardiansByWard(
  em: EntityManager,
  scope: ClubScope,
  wardIds: readonly string[],
): Promise<Map<string, MedicalGuardianRow[]>> {
  const result = new Map<string, MedicalGuardianRow[]>()
  if (wardIds.length === 0) return result
  const rows = await em.find(
    Guardianship,
    { ...scope, wardPersonId: { $in: [...wardIds] }, deletedAt: null },
    { fields: ['id', 'wardPersonId', 'guardianPersonId', 'validFrom', 'validTo', 'consents'] },
  )
  for (const row of rows) {
    const entry: MedicalGuardianRow = {
      guardianPersonId: row.guardianPersonId,
      validFrom: row.validFrom,
      validTo: row.validTo ?? null,
      consents: parseStoredConsents(row.consents),
    }
    result.set(row.wardPersonId, [...(result.get(row.wardPersonId) ?? []), entry])
  }
  return result
}

/** Clears one person's date under its row lock if the decision still holds; true when it cleared. */
async function clearDate(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  personId: string,
  today: CalendarDate,
): Promise<boolean> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const person = await em.transactional(async (tx) => {
    const locked = await findWithDecryption(
      tx,
      Person,
      { id: personId, ...scope, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
      scope,
    )
    const row = locked[0]
    if (!row?.medicalValidUntil) return null
    const guardians = await guardiansByWard(tx, scope, [personId])
    if (decideMedical(medicalFacts(row), guardians.get(personId) ?? [], today).action !== 'clear') return null
    row.medicalValidUntil = null
    row.updatedAt = new Date()
    await tx.flush()
    return row
  })
  if (!person) return false
  await emitMedicalUpdated(ctx, person)
  return true
}

/** Enqueues one reminder in its own transaction and publishes it; true when a new dispatch went out. */
async function remind(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  person: Pick<Person, 'id' | 'firstName' | 'birthDate'>,
  guardians: readonly MedicalGuardianRow[],
  kind: MedicalReminderKind,
  validUntil: CalendarDate,
  today: CalendarDate,
): Promise<boolean> {
  const ward = !holdsOwnConsents(person.birthDate, today)
  const personIds = ward
    ? [...new Set(guardians.filter((row) => isActiveAt(row, today)).map((row) => row.guardianPersonId))]
    : [person.id]
  if (personIds.length === 0) return false
  const container = ctx.container
  const context = { container, ...scope, scope: [{ kind: 'system_job' as const }] }
  const audience = await resolveMembers(
    personIds.map((personId) => ({ personId, reason: 'direct' as const })),
    context,
  )
  const recipients = audience.recipients.filter((recipient) => recipient.channels.length > 0)
  if (recipients.length === 0) return false
  const dispatch = container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  const em = container.resolve<EntityManager>('em').fork()
  const dispatchId = await em.transactional(async (tx) => {
    const enqueued = await dispatch.enqueue(
      tx,
      {
        template: kind === 'expiring' ? MEDICAL_EXPIRING_TEMPLATE : MEDICAL_EXPIRED_TEMPLATE,
        params: { personId: person.id, name: person.firstName, validUntil, ward },
        recipients,
        source: { module: 'people', type: 'people:person', id: person.id },
        idempotencyKey: medicalReminderKey(person.id, validUntil, kind),
        actor: { userId: null, actingRole: 'system' },
      },
      { ...context, em: tx },
    )
    return enqueued.created ? enqueued.dispatchId : null
  })
  if (!dispatchId) return false
  await dispatch.publish(dispatchId, scope)
  return true
}

/** Runs steps 1–3 for one club on `today`; with `dryRun` only counts. */
export async function runMedicalReminders(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  options: Options,
): Promise<MedicalRemindersCounts> {
  const counts: MedicalRemindersCounts = {
    reminded: 0,
    clearedNoConsent: 0,
    clearedRetention: 0,
    clearedDeparted: 0,
    failed: 0,
  }
  const fail = (error: unknown, step: string) => {
    counts.failed += 1
    options.onFailure(error, step)
  }
  const { today } = options
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const persons = await findWithDecryption(
    em,
    Person,
    { ...scope, deletedAt: null, anonymizedAt: null, medicalValidUntil: { $ne: null } },
    { fields: ['id', 'firstName', 'birthDate', 'leftOn', 'consents', 'medicalValidUntil'], orderBy: { id: 'asc' } },
    scope,
  )
  const guardians = await guardiansByWard(
    em,
    scope,
    persons.map((person) => person.id),
  )
  const dispatch = ctx.container.resolve<DispatchService>(FOUNDATION_DISPATCH)
  for (const person of persons) {
    const rows = guardians.get(person.id) ?? []
    const decision = decideMedical(medicalFacts(person), rows, today)
    if (decision.action === 'none') continue
    try {
      if (decision.action === 'clear') {
        const cleared = options.dryRun ? true : await clearDate(ctx, scope, person.id, today)
        if (cleared) counts[CLEAR_COUNTS[decision.reason]] += 1
        continue
      }
      const keys = decision.kinds.map((kind) => medicalReminderKey(person.id, decision.validUntil, kind))
      const used = await dispatch.existingKeys(keys, scope)
      for (const kind of decision.kinds) {
        if (used.has(medicalReminderKey(person.id, decision.validUntil, kind))) continue
        const sent = options.dryRun ? true : await remind(ctx, scope, person, rows, kind, decision.validUntil, today)
        if (sent) counts.reminded += 1
      }
    } catch (error: unknown) {
      fail(error, decision.action === 'clear' ? 'medical_clear' : 'medical_remind')
    }
  }
  return counts
}
