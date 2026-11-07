// `club_core.contracts.create|update|delete` (club spec *Data Models* → `club_core_contracts`, DD-09, REQ-021; README
// B-07; #96). The club administrator records who the club has a contract with, of which kind and for which period; a
// coach contract is with a person and carries every rate of the club's settlement model (R14), stored encrypted.
// Active contracts of one kind for one party never overlap (409 `contract_overlap`), checked under a per-party lock.
// The party and the kind are fixed once a contract exists. Delete is a soft delete; an undo that would bring back an
// overlap is refused the same way.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { Contract } from '../data/entities'
import { lockContractParty } from '../data/queries'
import {
  contractCreateSchema,
  contractDeleteSchema,
  contractUpdateSchema,
  type ContractCreateInput,
} from '../data/validators'
import {
  coachTermsForModel,
  missingCoachTerms,
  overlappingContract,
  parseCoachTerms,
  partyAllowed,
  type CoachTerms,
  type ContractKind,
  type ContractPartyType,
} from '../lib/contracts'
import { liveContractsOf, partyNames } from '../services/contracts'
import { readClubSettings } from '../services/settings'
import {
  STRUCTURE_WRITE_KINDS,
  authorizeReplay,
  decryptionScope,
  emitStructure,
  existingSpec,
  inWriteTransaction,
  structureEvents,
  structureLog,
  structureTarget,
  throwFieldError,
  trustedTenantId,
  undoCreate,
  undoRestore,
  type StructureCommandResult,
} from './shared'

export const CONTRACT_RESOURCE_KIND = 'club_core.contract'

export const contractEvents = structureEvents<Contract>('contract')

export type ContractSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  partyType: string
  partyId: string
  kind: string
  validFrom: string
  validTo: string | null
  terms: CoachTerms | null
}

export type ContractCommandResult = StructureCommandResult<Contract, ContractSnapshot>

type Scope = { tenantId: string; organizationId: string }

export function contractSnapshot(row: Contract): ContractSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    partyType: row.partyType,
    partyId: row.partyId,
    kind: row.kind,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    terms: row.terms ? parseCoachTerms(row.terms) : null,
  }
}

function restoreContract(row: Contract, before: ContractSnapshot): void {
  row.validFrom = before.validFrom
  row.validTo = before.validTo
  row.terms = before.terms ? JSON.stringify(before.terms) : null
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Contract | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    const where = { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }
    return findOneWithDecryption(em, Contract, where, lock, decryptionScope(ctx))
  }
}

/** 422 `contract_party_invalid` unless the kind admits the party type and the party is a live record of the club. */
async function assertParty(ctx: CommandRuntimeContext, em: EntityManager, scope: Scope, input: ContractCreateInput) {
  if (!partyAllowed(input.kind, input.partyType)) await throwFieldError('contract_party_invalid', 'partyType')
  const names = await partyNames(ctx.container, em, scope, [input])
  if (!names.has(input.partyId)) await throwFieldError('contract_party_invalid', 'partyId')
}

/**
 * The terms a contract stores, as JSON text: a coach contract keeps only its club model's rates and must carry each
 * of them (422 `contract_terms_invalid` on the first missing one); every other kind stores none.
 */
async function storedTerms(em: EntityManager, scope: Scope, kind: string, terms: CoachTerms): Promise<string | null> {
  if ((kind as ContractKind) !== 'coach') return null
  const { values } = await readClubSettings(em, scope)
  const missing = missingCoachTerms(terms, values.coachSettlementModel)
  if (missing.length > 0) await throwFieldError('contract_terms_invalid', missing[0])
  return JSON.stringify(coachTermsForModel(terms, values.coachSettlementModel))
}

/** 409 `contract_overlap` when another live contract of the same kind for the same party shares a day with `row`. */
async function assertNoOverlap(em: EntityManager, row: Contract): Promise<void> {
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  await lockContractParty(em, row.organizationId, row.partyId)
  const others = await liveContractsOf(em, scope, { partyType: row.partyType, partyId: row.partyId, kind: row.kind })
  const candidate = { id: row.id, validFrom: row.validFrom, validTo: row.validTo ?? null }
  const clash = overlappingContract(
    candidate,
    others.map((other) => ({ id: other.id, validFrom: other.validFrom, validTo: other.validTo ?? null })),
  )
  if (clash) await throwFieldError('contract_overlap', 'validFrom')
}

const createContractCommand: CommandHandler<Record<string, unknown>, ContractCommandResult> = {
  id: 'club_core.contracts.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'club_core.contracts.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: contractCreateSchema,
          resourceKind: CONTRACT_RESOURCE_KIND,
          allowedKinds: STRUCTURE_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => structureTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertParty(ctx, em, scope, parsed)
      const row = em.create(Contract, {
        id,
        tenantId,
        organizationId,
        partyType: parsed.partyType satisfies ContractPartyType,
        partyId: parsed.partyId,
        kind: parsed.kind,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
        terms: await storedTerms(em, scope, parsed.kind, parsed.terms ?? {}),
      })
      await assertNoOverlap(em, row)
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitStructure(ctx, result.entity, 'created', contractEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: CONTRACT_RESOURCE_KIND,
      labelKey: 'club_core.audit.contracts.create',
      fallback: 'Create a contract',
      after: contractSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
    await undoCreate(ctx, row, contractEvents)
  },
}

const updateContractCommand: CommandHandler<Record<string, unknown>, ContractCommandResult> = {
  id: 'club_core.contracts.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.contracts.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(contractUpdateSchema, CONTRACT_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Contract
      const before = contractSnapshot(row)
      const patch = authorized.parsed
      row.validFrom = patch.validFrom
      if (patch.validTo !== undefined) row.validTo = patch.validTo
      if (patch.terms !== undefined) {
        const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
        row.terms = await storedTerms(em, scope, row.kind, patch.terms ?? {})
      }
      await assertNoOverlap(em, row)
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'updated', contractEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: CONTRACT_RESOURCE_KIND,
      labelKey: 'club_core.audit.contracts.update',
      fallback: 'Change a contract',
      after: contractSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ContractSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing contract snapshot for undo')
    const row = await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, before.id, loader(ctx))
    restoreContract(row, before)
    await assertNoOverlap(ctx.transactionalEm as EntityManager, row)
    await undoRestore(ctx, row, before, restoreContract, contractEvents, 'updated')
  },
}

const deleteContractCommand: CommandHandler<Record<string, unknown>, ContractCommandResult> = {
  id: 'club_core.contracts.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.contracts.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(contractDeleteSchema, CONTRACT_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Contract
      const before = contractSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'deleted', contractEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: CONTRACT_RESOURCE_KIND,
      labelKey: 'club_core.audit.contracts.delete',
      fallback: 'Delete a contract',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, logEntry.resourceId, loader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ContractSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing contract snapshot for undo')
    const row = await authorizeReplay(ctx, CONTRACT_RESOURCE_KIND, before.id, loader(ctx, true))
    restoreContract(row, before)
    await assertNoOverlap(ctx.transactionalEm as EntityManager, row)
    await undoRestore(ctx, row, before, restoreContract, contractEvents, 'created')
  },
}

registerCommand(createContractCommand)
registerCommand(updateContractCommand)
registerCommand(deleteContractCommand)
