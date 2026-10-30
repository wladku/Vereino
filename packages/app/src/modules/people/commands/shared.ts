// Shared pieces of the `people` commands: the write transaction, scope targets, tenant-narrowed loads, snapshots and
// the CRUD side-effect configs. Scope checks stay in `authorizeScoped` (foundation spec REQ-F16).
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import type { CrudEventsConfig, CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { Scope, ScopeTarget } from '@vereino/core'
import { trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { parseStoredConsents, type GuardianRelation, type StoredConsents } from '../lib/people-rules'

export const PERSON_ENTITY_ID = 'people:person'

/**
 * Runs `phase` in one write transaction and returns its value. Uses the replay transaction when the command bus
 * provides one (`atomicReplay` redo), else a fresh fork of the request EntityManager.
 */
export async function inWriteTransaction<T>(
  ctx: CommandRuntimeContext,
  label: string,
  phase: (em: EntityManager) => Promise<T>,
): Promise<T> {
  const em = ctx.transactionalEm ?? ctx.container.resolve<EntityManager>('em').fork()
  const box: { value?: T } = {}
  await withAtomicFlush(
    em,
    [
      async () => {
        box.value = await phase(em)
      },
    ],
    { transaction: true, label },
  )
  if (!('value' in box)) throw new Error('[internal] the write transaction produced no result: ' + label)
  return box.value as T
}

export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof UniqueConstraintViolationException) return true
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

/** The tenant a command may load targets from (the session's or the job's); null fails closed later. */
export function trustedTenantId(ctx: CommandRuntimeContext, job = false): string | null {
  return trustedScopeOf(ctx, job ? { job: true } : undefined)?.tenantId ?? null
}

function decryptionScope(ctx: CommandRuntimeContext, job: boolean) {
  const scope = trustedScopeOf(ctx, job ? { job: true } : undefined)
  return { tenantId: scope?.tenantId ?? null, organizationId: scope?.organizationId ?? null }
}

/** Loads and row-locks a person of the trusted tenant (decrypted); null when absent or outside the tenant. */
export async function loadPersonLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock,
  job = false,
): Promise<Person | null> {
  const tenantId = trustedTenantId(ctx, job)
  if (!tenantId) return null
  return findOneWithDecryption(em, Person, { id, tenantId, deletedAt: null }, lock, decryptionScope(ctx, job))
}

export async function loadRoleAssignmentLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock,
): Promise<RoleAssignment | null> {
  const tenantId = trustedTenantId(ctx)
  if (!tenantId) return null
  return em.findOne(RoleAssignment, { id, tenantId, deletedAt: null }, lock)
}

export async function loadGuardianshipLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock,
): Promise<Guardianship | null> {
  const tenantId = trustedTenantId(ctx)
  if (!tenantId) return null
  return em.findOne(Guardianship, { id, tenantId, deletedAt: null }, lock)
}

/** A person of the given organization exists (not deleted). */
export async function personExists(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  personId: string,
): Promise<boolean> {
  const found = await em.findOne(Person, { id: personId, ...scope, deletedAt: null }, { fields: ['id'] })
  return found !== null
}

/**
 * Row-locks a person of the organization (`SELECT … FOR UPDATE`) and tells whether it exists. Commands that check a
 * rule across several rows of one person — no duplicate active role assignment, one primary payer per ward — take
 * this lock first, so concurrent writes for the same person are serialized and the check cannot race.
 */
export async function lockPerson(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  personId: string,
): Promise<boolean> {
  const found = await em.findOne(
    Person,
    { id: personId, ...scope, deletedAt: null },
    { fields: ['id'], lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  return found !== null
}

/** The caller's own person (the `self` grant the scope provider returned), recorded as who changed a consent. */
export function actorPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

export function personTarget(person: Pick<Person, 'id' | 'tenantId' | 'organizationId'>): ScopeTarget {
  return { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId, personId: person.id }
}

export function roleAssignmentTarget(
  row: Pick<RoleAssignment, 'id' | 'tenantId' | 'organizationId' | 'personId' | 'sectionId'>,
): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    personId: row.personId,
    sectionId: row.sectionId ?? null,
  }
}

export function guardianshipTarget(
  row: Pick<Guardianship, 'id' | 'tenantId' | 'organizationId' | 'wardPersonId'>,
): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, personId: row.wardPersonId }
}

const idsOnly = (ctx: { identifiers: { id: string; tenantId: string | null; organizationId: string | null } }) => ({
  id: ctx.identifiers.id,
  tenantId: ctx.identifiers.tenantId,
  organizationId: ctx.identifiers.organizationId,
})

/** `people.person.created|updated|deleted`; ids only (S4.6). */
export const personEvents: CrudEventsConfig<Person> = {
  module: 'people',
  entity: 'person',
  persistent: true,
  buildPayload: idsOnly,
}

export const personIndexer: CrudIndexerConfig<Person> = {
  entityType: PERSON_ENTITY_ID,
  buildUpsertPayload: (ctx) => ({ entityType: PERSON_ENTITY_ID, recordId: ctx.identifiers.id, ...idsOnly(ctx) }),
  buildDeletePayload: (ctx) => ({ entityType: PERSON_ENTITY_ID, recordId: ctx.identifiers.id, ...idsOnly(ctx) }),
}

/** `people.role_assignment.created|updated|deleted`; carries the person id so the role sync needs no lookup. */
export const roleAssignmentEvents: CrudEventsConfig<RoleAssignment> = {
  module: 'people',
  entity: 'role_assignment',
  persistent: true,
  buildPayload: (ctx) => ({ ...idsOnly(ctx), personId: ctx.entity.personId }),
}

/** `people.guardianship.created|updated|deleted`; carries the guardian id (the payer rule). */
export const guardianshipEvents: CrudEventsConfig<Guardianship> = {
  module: 'people',
  entity: 'guardianship',
  persistent: true,
  buildPayload: (ctx) => ({ ...idsOnly(ctx), guardianPersonId: ctx.entity.guardianPersonId }),
}

/**
 * The person fields an undo restores. The PESEL and the notes are deliberately not kept in the audit log (only
 * whether they are set), so an undo does not restore them.
 */
export type PersonSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  firstName: string
  lastName: string
  preferredLocale: string | null
  birthDate: string | null
  email: string | null
  /** Absent in snapshots written before #26. */
  phone?: string | null
  userId: string | null
  hasPesel: boolean
  hasNotes: boolean
  /** Whether an import identifier is set (#28); absent in older snapshots. Not restored by an undo, like the PESEL. */
  hasExternalId?: boolean
}

export function personSnapshot(person: Person): PersonSnapshot {
  return {
    id: person.id,
    tenantId: person.tenantId,
    organizationId: person.organizationId,
    firstName: person.firstName,
    lastName: person.lastName,
    preferredLocale: person.preferredLocale ?? null,
    birthDate: person.birthDate ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    userId: person.userId ?? null,
    hasPesel: Boolean(person.pesel),
    hasNotes: Boolean(person.notes),
    hasExternalId: Boolean(person.externalId),
  }
}

export type RoleAssignmentSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  personId: string
  role: RoleAssignment['role']
  sectionId: string | null
  validFrom: string
  validTo: string | null
}

export function roleAssignmentSnapshot(row: RoleAssignment): RoleAssignmentSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    personId: row.personId,
    role: row.role,
    sectionId: row.sectionId ?? null,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

/** Everything an undo of a guardianship update, end or consent change restores (consents are not encrypted). */
export type GuardianshipSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  guardianPersonId: string
  wardPersonId: string
  relation: GuardianRelation
  isPrimaryPayer: boolean
  consents: StoredConsents
  validFrom: string
  validTo: string | null
}

export function guardianshipSnapshot(row: Guardianship): GuardianshipSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    guardianPersonId: row.guardianPersonId,
    wardPersonId: row.wardPersonId,
    relation: row.relation,
    isPrimaryPayer: row.isPrimaryPayer,
    consents: parseStoredConsents(row.consents),
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}
