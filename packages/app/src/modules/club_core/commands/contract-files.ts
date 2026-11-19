// `club_core.contracts.attachment.set` and `club_core.contracts.attachment.remove` (people life-cycle spec REQ-L12,
// *Data Models* → `club_core_contracts.attachment_id`, *API* row `/api/club_core/contracts/{id}/attachment`; #312): a
// contract's signed PDF (one, up to 10 MB). Written by the club administrator (the routes require
// `club_core.contracts.manage`). The route checks the format and the size by the file's bytes; the bytes go to the
// platform `attachments` module (private partition, owner and assignment set, so the scoped read names exactly this
// file) and the pointer on the contract is written in the upload transaction (`persistLink`), after the contract row is
// locked again. A second upload replaces the pointer; earlier files stay in `attachments`, so the undo of a removal
// always finds its file.
//
// The attachment is a file link, not one of the contract's form fields: neither command asks for the contract's lock
// token (like a place's files), but the row's `updatedAt` moves with the pointer, so the contract page reloads the
// record after a file change before the form is saved again. `set` is
// not undoable (its bytes are not in the stored command input; remove or replace is the compensating action); `remove`
// is undoable (the pointer comes back). The audit log records every change.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import type { Contract } from '../data/entities'
import { CONTRACT_ATTACHMENT_ASSIGNMENT, CONTRACT_ATTACHMENT_OWNER_ENTITY } from '../lib/files'
import { CONTRACT_RESOURCE_KIND, contractLoader } from './contracts'
import { CLUB_CORE_PARTITION, attachmentServiceOf, uploadOf } from './logos'
import {
  STRUCTURE_WRITE_KINDS,
  inWriteTransaction,
  structureLog,
  structureTarget,
  type StructureCommandResult,
} from './shared'

export type ContractAttachmentSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  attachmentId: string | null
}

export type ContractAttachmentResult = StructureCommandResult<Contract, ContractAttachmentSnapshot>

const contractIdSchema = z.object({ id: z.uuid() }).strict()

function attachmentSnapshot(row: Contract): ContractAttachmentSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    attachmentId: row.attachmentId ?? null,
  }
}

/** The live contract, row-locked in the trusted tenant; no lock token (the file is not a form field). */
function contractFileSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof contractIdSchema, Contract> {
  const load = contractLoader(ctx)
  return {
    input: contractIdSchema,
    resourceKind: CONTRACT_RESOURCE_KIND,
    allowedKinds: STRUCTURE_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => structureTarget(entity as Contract),
    lock: 'none',
  }
}

async function authorizeContractFile(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
  mode: 'execute' | 'replay' = 'execute',
) {
  const authorized = await authorizeScoped(contractFileSpec(ctx), rawInput, ctx, em, { mode })
  return { row: authorized.entity as Contract, actingRole: authorized.actingRole }
}

function attachmentLog(result: ContractAttachmentResult, labelKey: string, fallback: string) {
  return structureLog({
    result,
    resourceKind: CONTRACT_RESOURCE_KIND,
    labelKey,
    fallback,
    after: attachmentSnapshot(result.entity),
  })
}

const setContractAttachmentCommand: CommandHandler<Record<string, unknown>, ContractAttachmentResult> = {
  id: 'club_core.contracts.attachment.set',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    // Refuse early (403, 404) before any byte is stored; the check repeats on the locked row below.
    const probe = await inWriteTransaction(ctx, 'club_core.contracts.attachment.set.check', (em) =>
      authorizeContractFile(rawInput, ctx, em),
    )
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] contract attachment upload without a trusted scope')
    const box: { result?: ContractAttachmentResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: CONTRACT_ATTACHMENT_OWNER_ENTITY,
      recordId: probe.row.id,
      partitionCode: CLUB_CORE_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: CONTRACT_ATTACHMENT_ASSIGNMENT, id: probe.row.id }],
      persistLink: async (tx, attachmentId) => {
        const { row, actingRole } = await authorizeContractFile(rawInput, ctx, tx)
        const before = attachmentSnapshot(row)
        row.attachmentId = attachmentId
        await tx.flush()
        box.result = { entity: row, actingRole, before }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the contract attachment upload produced no result')
    return result
  },
  buildLog: ({ result }) => attachmentLog(result, 'club_core.audit.contracts.attachment.set', 'Attach a contract PDF'),
}

const removeContractAttachmentCommand: CommandHandler<Record<string, unknown>, ContractAttachmentResult> = {
  id: 'club_core.contracts.attachment.remove',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'club_core.contracts.attachment.remove', async (em) => {
      const { row, actingRole } = await authorizeContractFile(rawInput, ctx, em)
      const before = attachmentSnapshot(row)
      row.attachmentId = null
      return { entity: row, actingRole, before }
    })
  },
  buildLog: ({ result }) =>
    attachmentLog(result, 'club_core.audit.contracts.attachment.remove', 'Remove a contract PDF'),
  async authorizeReplay({ ctx, logEntry }) {
    const em = ctx.transactionalEm
    if (!em || !logEntry.resourceId) throw new Error('[internal] contract attachment replay needs the transaction')
    await authorizeContractFile({ id: logEntry.resourceId }, ctx, em, 'replay')
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ContractAttachmentSnapshot | null | undefined
    const em = ctx.transactionalEm
    if (!em || !before?.id) throw new Error('[internal] missing contract attachment snapshot for undo')
    const { row } = await authorizeContractFile({ id: before.id }, ctx, em, 'replay')
    row.attachmentId = before.attachmentId
    await em.flush()
  },
}

registerCommand(setContractAttachmentCommand)
registerCommand(removeContractAttachmentCommand)
