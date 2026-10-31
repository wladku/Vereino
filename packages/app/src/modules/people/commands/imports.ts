// `people.imports.create|decide_row|commit|cancel` (club spec REQ-036, DD-38, API table; #28): the club administrator
// uploads a CSV or XLSX of families with a column mapping, sees every row classified, decides the doubtful rows and
// commits. The file goes to the private `attachments` partition (owner `people:person_import`, its own assignment);
// the rows are staged in `people_import_rows` with their values as encrypted JSON. The commit re-plans the rows
// against the club as it is then (so a person created meanwhile is matched, not duplicated) and runs the existing
// `people.persons.create|update` and `people.guardianships.create` commands inside one transaction, so their
// validation, encryption and audit entries apply and either the whole import is written or nothing; their events
// and index updates are emitted after that transaction commits. A committed import cannot be committed again (409),
// and the same file imported again finds every identified person and creates nothing.
//
// `create` is not undoable (the bytes are not in the stored input; `cancel` is the compensating action), `commit`
// is not undoable as a whole (each person and guardianship it wrote has its own undoable entry); `decide_row` and
// `cancel` are undoable while the import is still open.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import {
  registerCommand,
  type CommandBus,
  type CommandHandler,
  type CommandRuntimeContext,
} from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, ScopeTarget } from '@vereino/core'
import { authorizeScoped, foundationErrors, trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person, PersonImport, PersonImportRow, type ImportRowResult, type ImportSummary } from '../data/entities'
import { importActionSchema, importCreateSchema, importDecisionSchema, importRowRefSchema } from '../data/validators'
import { emitPeopleEvent } from '../events'
import type { ImportFormat, ImportSheet } from '../lib/import-file'
import { checkMapping, type ImportMapping } from '../lib/import-mapping'
import {
  GROUPS_NOT_ENABLED,
  classificationCounts,
  normalizeImportRow,
  planImport,
  type ExistingDirectory,
  type ImportDecision,
  type NormalizedImportRow,
  type PersonRef,
  type RowPlan,
} from '../lib/import-rules'
import { clubToday } from '../services/club-clock'
import { loadImportDirectory } from '../services/import-directory'
import type { GuardianshipCommandResult } from './guardianships'
import type { PersonCommandResult } from './persons'
import { actorPersonId, guardianshipEvents, inWriteTransaction, personEvents, personIndexer } from './shared'

export const IMPORT_RESOURCE_KIND = 'people.import'
export const IMPORT_ROW_RESOURCE_KIND = 'people.import_row'
/**
 * Attachment owner of an import file. The platform's upload adds the owner as the file's only assignment, so
 * `releaseScoped` (the purge) names that one assignment; an extra assignment would make the release refuse (409).
 */
export const IMPORT_FILE_OWNER_ENTITY = 'people:person_import'
/** The platform's private partition; the import routes require `people.manage` and `people.pesel.view`. */
export const IMPORT_PARTITION = 'privateAttachments'
const MANAGE_KINDS = ['club_admin'] as const

const FORMAT_MIME_TYPES: Record<ImportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/** Where the route hands the read file to the command (never part of the stored command input). */
const IMPORT_UPLOAD_CONTEXT = Symbol.for('vereino.people.import_upload')

export type ImportUpload = { buffer: Buffer; format: ImportFormat; sheet: ImportSheet }

type UploadContext = CommandRuntimeContext & { [IMPORT_UPLOAD_CONTEXT]?: ImportUpload }

export function withImportUpload(ctx: CommandRuntimeContext, upload: ImportUpload): CommandRuntimeContext {
  return Object.assign(ctx, { [IMPORT_UPLOAD_CONTEXT]: upload })
}

function uploadOf(ctx: CommandRuntimeContext): ImportUpload {
  const upload = (ctx as UploadContext)[IMPORT_UPLOAD_CONTEXT]
  if (!upload) throw new CrudHttpError(400, { error: 'File is required' })
  return upload
}

export function attachmentServiceOf(ctx: { container: CommandRuntimeContext['container'] }): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

type ClubScope = { tenantId: string; organizationId: string }

function importTarget(row: { id: string; tenantId: string; organizationId: string }): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

/** The stored values of a staged row (decrypted by the caller). */
export function storedRow(row: Pick<PersonImportRow, 'raw' | 'rowNo'>): NormalizedImportRow {
  if (!row.raw) return { rowNo: row.rowNo, persons: {}, group: null, error: null }
  return JSON.parse(row.raw) as NormalizedImportRow
}

function storedMapping(record: PersonImport): ImportMapping {
  return record.mapping.fields
}

async function loadImportLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock | undefined,
): Promise<PersonImport | null> {
  const scope = trustedScopeOf(ctx)
  if (!scope) return null
  return em.findOne(PersonImport, { id, ...scope, deletedAt: null }, lock)
}

/** 409 for an import that is no longer open. */
async function assertOpen(record: PersonImport): Promise<void> {
  if (record.status === 'committed') await peopleErrors.throw('import_already_committed')
  if (record.status === 'cancelled') await peopleErrors.throw('import_cancelled')
}

export type ImportCommandResult = { record: PersonImport; actingRole: ActingRole }

function importSnapshot(record: PersonImport) {
  return {
    id: record.id,
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    status: record.status,
    fileFormat: record.fileFormat,
    rowCount: record.rowCount,
    summary: record.summary,
    committedAt: record.committedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  }
}

async function importLog(result: ImportCommandResult, labelKey: string, fallback: string, extra = {}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(labelKey, fallback),
    resourceKind: IMPORT_RESOURCE_KIND,
    resourceId: result.record.id,
    tenantId: result.record.tenantId,
    organizationId: result.record.organizationId,
    snapshotAfter: importSnapshot(result.record),
    context: { actingRole: result.actingRole, ...extra },
  }
}

// --- create ------------------------------------------------------------------------------------------------------

const createImportCommand: CommandHandler<Record<string, unknown>, ImportCommandResult> = {
  id: 'people.imports.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    const id = randomUUID()
    const authorized = await inWriteTransaction(ctx, 'people.imports.create.check', (em) =>
      authorizeScoped(
        {
          input: importCreateSchema,
          resourceKind: IMPORT_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => ({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      ),
    )
    const createdBy = actorPersonId(authorized.scope)
    if (!createdBy) return foundationErrors.throw('scope_denied')
    const mapping = authorized.parsed.mapping as ImportMapping
    const { header, rows: sheetRows, date1904 } = upload.sheet
    const check = checkMapping(mapping, header.length)
    if (!check.ok) return peopleErrors.throw('import_mapping_invalid', { problem: check.problem, field: check.field })
    if (sheetRows.length === 0) return peopleErrors.throw('import_mapping_invalid', { problem: 'empty' })

    const scope: ClubScope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const today = await clubToday(ctx.container, scope)
    const options = { header, mapping, date1904, today }
    const rows = sheetRows.map((row) => normalizeImportRow(row, options))
    const readEm = ctx.container.resolve<EntityManager>('em').fork()
    const directory = await loadImportDirectory(readEm, scope, rows, [], today)
    const plans = planImport(rows, directory, new Map(), options)
    const byRowNo = new Map(rows.map((row) => [row.rowNo, row]))

    const box: { record?: PersonImport } = {}
    await attachmentServiceOf(ctx).createScoped({
      ...scope,
      entityId: IMPORT_FILE_OWNER_ENTITY,
      recordId: id,
      partitionCode: IMPORT_PARTITION,
      fileName: `people-import.${upload.format}`,
      declaredMimeType: FORMAT_MIME_TYPES[upload.format],
      buffer: upload.buffer,
      persistLink: async (tx, attachmentId) => {
        const record = tx.create(PersonImport, {
          id,
          ...scope,
          fileAttachmentId: attachmentId,
          fileFormat: upload.format,
          mapping: { header, fields: mapping, date1904 },
          status: 'previewed',
          rowCount: rows.length,
          createdByPersonId: createdBy,
          summary: classificationCounts(plans),
        })
        tx.persist(record)
        for (const plan of plans) {
          tx.persist(
            tx.create(PersonImportRow, {
              ...scope,
              importId: id,
              rowNo: plan.rowNo,
              raw: JSON.stringify(byRowNo.get(plan.rowNo)),
              classification: plan.classification,
              matchedPersonId: plan.matchedPersonId,
              errorCode: plan.errorCode,
              errorColumn: plan.errorColumn,
              reviewReason: plan.reviewReason,
            }),
          )
        }
        await tx.flush()
        box.record = record
      },
    })
    if (!box.record) throw new Error('[internal] the import upload produced no record')
    return { record: box.record, actingRole: authorized.actingRole }
  },
  buildLog: ({ result }) => importLog(result, 'people.audit.imports.create', 'Upload a people import'),
}

// --- decide_row --------------------------------------------------------------------------------------------------

export type ImportRowDecisionSnapshot = {
  id: string
  importId: string
  tenantId: string
  organizationId: string
  decision: PersonImportRow['decision'] | null
  decisionPersonId: string | null
}

export type ImportRowCommandResult = {
  row: PersonImportRow
  actingRole: ActingRole
  before: ImportRowDecisionSnapshot
}

function decisionSnapshot(row: PersonImportRow): ImportRowDecisionSnapshot {
  return {
    id: row.id,
    importId: row.importId,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    decision: row.decision ?? null,
    decisionPersonId: row.decisionPersonId ?? null,
  }
}

/** Locks the import first, then the row (the order `commit` takes too), and returns the open row. */
async function loadRowLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  importId: string,
  rowId: string,
  lock: TargetLock,
): Promise<PersonImportRow | null> {
  const record = await loadImportLocked(em, ctx, importId, lock)
  if (!record) return null
  await assertOpen(record)
  return em.findOne(
    PersonImportRow,
    { id: rowId, importId, tenantId: record.tenantId, organizationId: record.organizationId },
    lock,
  )
}

/** Which decisions a row allows: a `review` row any; an identified row only `skip`; an `error` row none. */
async function assertDecisionAllowed(row: PersonImportRow, action: ImportDecision['action']): Promise<void> {
  const allowed = row.classification === 'review' || (row.classification !== 'error' && action === 'skip')
  if (!allowed) await peopleErrors.throw('import_decision_invalid')
}

const decideRowCommand: CommandHandler<Record<string, unknown>, ImportRowCommandResult> = {
  id: 'people.imports.decide_row',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'people.imports.decide_row', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: importDecisionSchema,
          resourceKind: IMPORT_ROW_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadRowLocked(txEm, ctx, parsed.importId, parsed.rowId, lock),
          resolveTarget: (_parsed, row) => importTarget(row as PersonImportRow),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as PersonImportRow
      const { action, personId } = authorized.parsed
      await assertDecisionAllowed(row, action)
      if (action === 'match') {
        const person = await em.findOne(
          Person,
          { id: personId, tenantId: row.tenantId, organizationId: row.organizationId, deletedAt: null },
          { fields: ['id'] },
        )
        if (!person) await peopleErrors.throw('import_person_not_found')
      }
      const before = decisionSnapshot(row)
      row.decision = action
      row.decisionPersonId = action === 'match' ? (personId ?? null) : null
      row.updatedAt = new Date()
      return { row, actingRole: authorized.actingRole, before }
    })
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.imports.decide_row', 'Decide an import row'),
      resourceKind: IMPORT_ROW_RESOURCE_KIND,
      resourceId: result.row.id,
      tenantId: result.row.tenantId,
      organizationId: result.row.organizationId,
      parentResourceKind: IMPORT_RESOURCE_KIND,
      parentResourceId: result.row.importId,
      snapshotBefore: result.before,
      snapshotAfter: decisionSnapshot(result.row),
      context: { actingRole: result.actingRole, rowNo: result.row.rowNo },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await replayRow(ctx, logEntry.snapshotBefore as ImportRowDecisionSnapshot | null | undefined)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ImportRowDecisionSnapshot | null | undefined
    const row = await replayRow(ctx, before)
    row.decision = before?.decision ?? null
    row.decisionPersonId = before?.decisionPersonId ?? null
    row.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
  },
}

/** Undo of a decision: the import must still be open (409 otherwise) and the caller still its administrator. */
async function replayRow(
  ctx: CommandRuntimeContext,
  before: ImportRowDecisionSnapshot | null | undefined,
): Promise<PersonImportRow> {
  const em = ctx.transactionalEm
  if (!em || !before?.id) throw new Error('[internal] import row replay needs the replay transaction and the snapshot')
  const { entity } = await authorizeScoped(
    {
      input: importRowRefSchema,
      resourceKind: IMPORT_ROW_RESOURCE_KIND,
      allowedKinds: MANAGE_KINDS,
      loadTarget: (parsed, txEm, lock) => loadRowLocked(txEm, ctx, parsed.importId, parsed.rowId, lock),
      resolveTarget: (_parsed, row) => importTarget(row as PersonImportRow),
    },
    { importId: before.importId, rowId: before.id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as PersonImportRow
}

// --- commit ------------------------------------------------------------------------------------------------------

export type ImportCommitResult = ImportCommandResult & {
  createdPersonIds: string[]
  updatedPersonIds: string[]
  matchedPersonIds: string[]
  guardianshipIds: string[]
}

type WrittenEntities = {
  persons: Map<string, Person>
  created: Set<string>
  guardianships: GuardianshipCommandResult['guardianship'][]
}

/**
 * The nested command context: the commit's transaction, no request (its lock header is the import's), no events yet.
 * A nested `people.persons.update` carries the person's version the plan read as `expectedUpdatedAt` instead.
 */
function nestedContext(ctx: CommandRuntimeContext, em: EntityManager): CommandRuntimeContext {
  return {
    ...ctx,
    request: undefined,
    transactionalEm: em,
    bulkImport: { skipEvents: true, skipReindex: true },
  }
}

function personInput(values: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

/** Writes one row's plan through the `people` commands; returns what it wrote. */
async function writeRow(
  plan: RowPlan,
  bus: CommandBus,
  nested: CommandRuntimeContext,
  keys: Map<string, string>,
  written: WrittenEntities,
  today: string,
  directory: ExistingDirectory,
): Promise<ImportRowResult> {
  const result: ImportRowResult = {
    participantPersonId: null,
    personIds: [],
    createdPersonIds: [],
    updatedPersonIds: [],
    guardianshipIds: [],
  }
  for (const planned of plan.persons) {
    let personId: string | undefined
    if (planned.ref.kind === 'existing') {
      personId = planned.ref.personId
      if (planned.update) {
        // A person changed since the plan read it answers 409 and rolls the whole commit back (S5.2).
        const expectedUpdatedAt = directory.persons.get(personId)?.updatedAt
        const { result: updated } = await bus.execute<unknown, PersonCommandResult>('people.persons.update', {
          input: { id: personId, ...personInput(planned.update), expectedUpdatedAt },
          ctx: nested,
        })
        written.persons.set(updated.person.id, updated.person)
        result.updatedPersonIds.push(personId)
      }
    } else if (planned.create) {
      const { result: created } = await bus.execute<unknown, PersonCommandResult>('people.persons.create', {
        input: personInput(planned.create),
        ctx: nested,
      })
      personId = created.person.id
      keys.set(planned.ref.key, personId)
      written.persons.set(personId, created.person)
      written.created.add(personId)
      result.createdPersonIds.push(personId)
    } else {
      personId = keys.get(planned.ref.key)
    }
    if (!personId) throw new Error('[internal] an import row refers to a person no earlier row created')
    result.personIds.push(personId)
    if (planned.slot === 'participant') result.participantPersonId = personId
  }
  const resolve = (ref: PersonRef): string => (ref.kind === 'existing' ? ref.personId : (keys.get(ref.key) as string))
  for (const link of plan.links) {
    const { result: created } = await bus.execute<unknown, GuardianshipCommandResult>('people.guardianships.create', {
      input: {
        guardianPersonId: resolve(link.guardian),
        wardPersonId: resolve(link.ward),
        relation: 'parent',
        isPrimaryPayer: link.isPrimaryPayer,
        validFrom: today,
      },
      ctx: nested,
    })
    written.guardianships.push(created.guardianship)
    result.guardianshipIds.push(created.guardianship.id)
  }
  return result
}

/** Plans the import's rows against the club as it is now (inside the commit's transaction). */
export async function planStoredImport(
  em: EntityManager,
  record: PersonImport,
  rows: readonly PersonImportRow[],
  today: string,
): Promise<{ plans: RowPlan[]; directory: ExistingDirectory }> {
  const scope = { tenantId: record.tenantId, organizationId: record.organizationId }
  const normalized = rows.map(storedRow)
  const decisions = new Map<number, ImportDecision>()
  for (const row of rows) {
    if (row.decision === 'match' && row.decisionPersonId) {
      decisions.set(row.rowNo, { action: 'match', personId: row.decisionPersonId })
    } else if (row.decision === 'create' || row.decision === 'skip') {
      decisions.set(row.rowNo, { action: row.decision })
    }
  }
  const matchIds = rows.flatMap((row) => (row.decisionPersonId ? [row.decisionPersonId] : []))
  const directory = await loadImportDirectory(em, scope, normalized, matchIds, today)
  const options = { header: record.mapping.header, mapping: storedMapping(record) }
  return { plans: planImport(normalized, directory, decisions, options), directory }
}

const commitImportCommand: CommandHandler<Record<string, unknown>, ImportCommitResult> = {
  id: 'people.imports.commit',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const written: WrittenEntities = { persons: new Map(), created: new Set(), guardianships: [] }
    const result = await inWriteTransaction(ctx, 'people.imports.commit', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: importActionSchema,
          resourceKind: IMPORT_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadImportLocked(txEm, ctx, parsed.id, lock),
          resolveTarget: (_parsed, record) => importTarget(record as PersonImport),
        },
        rawInput,
        ctx,
        em,
      )
      const record = authorized.entity as PersonImport
      await assertOpen(record)
      const committedBy = actorPersonId(authorized.scope)
      if (!committedBy) return foundationErrors.throw('scope_denied')
      const scope = { tenantId: record.tenantId, organizationId: record.organizationId }
      const rows = await findWithDecryption(
        em,
        PersonImportRow,
        { importId: record.id, ...scope },
        { orderBy: { rowNo: 'asc' } },
        scope,
      )
      const today = await clubToday(ctx.container, scope)
      const { plans, directory } = await planStoredImport(em, record, rows, today)
      const pending = plans.filter((plan) => plan.needsDecision).map((plan) => plan.rowNo)
      if (pending.length > 0) return peopleErrors.throw('import_review_pending', { rowNos: pending.slice(0, 50) })

      const bus = ctx.container.resolve<CommandBus>('commandBus')
      const nested = nestedContext(ctx, em)
      const keys = new Map<string, string>()
      const byRowNo = new Map(rows.map((row) => [row.rowNo, row]))
      const matched = new Set<string>()
      const committedAt = new Date()
      let skipped = 0
      let membershipsPending = 0
      for (const plan of plans) {
        const row = byRowNo.get(plan.rowNo) as PersonImportRow
        row.classification = plan.classification
        row.matchedPersonId = plan.matchedPersonId
        if (plan.idle) {
          skipped += 1
          continue
        }
        const rowResult = await writeRow(plan, bus, nested, keys, written, today, directory)
        for (const id of rowResult.personIds) if (!written.created.has(id)) matched.add(id)
        row.result = rowResult
        row.committedAt = committedAt
        row.groupName = plan.group
        // No membership is created here: the `groups` hook completes these rows later (D-026).
        row.membershipStatus = plan.group ? GROUPS_NOT_ENABLED : null
        if (plan.group) membershipsPending += 1
      }
      const summary: ImportSummary = {
        ...classificationCounts(plans),
        created: written.created.size,
        updated: [...written.persons.keys()].filter((id) => !written.created.has(id)).length,
        linked: written.guardianships.length,
        skipped,
        membershipsPending,
      }
      record.status = 'committed'
      record.committedAt = committedAt
      record.committedByPersonId = committedBy
      record.summary = summary
      record.updatedAt = committedAt
      await em.flush()
      return {
        record,
        actingRole: authorized.actingRole,
        createdPersonIds: [...written.created],
        updatedPersonIds: [...written.persons.keys()].filter((id) => !written.created.has(id)),
        matchedPersonIds: [...matched],
        guardianshipIds: written.guardianships.map((row) => row.id),
      }
    })
    // After the commit: the events and index updates the nested commands deferred, then the import's own event.
    const dataEngine = ctx.container.resolve<DataEngine>('dataEngine')
    for (const person of written.persons.values()) {
      await emitCrudSideEffects({
        dataEngine,
        action: written.created.has(person.id) ? 'created' : 'updated',
        entity: person,
        identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
        events: personEvents,
        indexer: personIndexer,
      })
    }
    for (const row of written.guardianships) {
      await emitCrudSideEffects({
        dataEngine,
        action: 'created',
        entity: row,
        identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
        events: guardianshipEvents,
      })
    }
    const scope = { tenantId: result.record.tenantId, organizationId: result.record.organizationId }
    await emitPeopleEvent('people.import.committed', { id: result.record.id, ...scope }, { persistent: true, ...scope })
    return result
  },
  buildLog: ({ result }) =>
    importLog(result, 'people.audit.imports.commit', 'Commit a people import', {
      createdPersonIds: result.createdPersonIds,
      updatedPersonIds: result.updatedPersonIds,
      matchedPersonIds: result.matchedPersonIds,
      guardianshipIds: result.guardianshipIds,
    }),
}

// --- cancel ------------------------------------------------------------------------------------------------------

const cancelImportCommand: CommandHandler<Record<string, unknown>, ImportCommandResult> = {
  id: 'people.imports.cancel',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'people.imports.cancel', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: importActionSchema,
          resourceKind: IMPORT_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadImportLocked(txEm, ctx, parsed.id, lock),
          resolveTarget: (_parsed, record) => importTarget(record as PersonImport),
        },
        rawInput,
        ctx,
        em,
      )
      const record = authorized.entity as PersonImport
      await assertOpen(record)
      record.status = 'cancelled'
      record.cancelledAt = new Date()
      record.updatedAt = record.cancelledAt
      return { record, actingRole: authorized.actingRole }
    })
  },
  buildLog: ({ result }) => importLog(result, 'people.audit.imports.cancel', 'Cancel a people import'),
  async authorizeReplay({ ctx, logEntry }) {
    await replayImport(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const record = await replayImport(ctx, logEntry.resourceId)
    // A purged import has lost its file and rows: it cannot be reopened.
    if (record.status !== 'cancelled' || record.purgedAt) await peopleErrors.throw('import_cancelled')
    record.status = 'previewed'
    record.cancelledAt = null
    record.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
  },
}

async function replayImport(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<PersonImport> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] import replay needs the replay transaction and the import id')
  const { entity } = await authorizeScoped(
    {
      input: importActionSchema,
      resourceKind: IMPORT_RESOURCE_KIND,
      allowedKinds: MANAGE_KINDS,
      loadTarget: (parsed, txEm) => loadImportLocked(txEm, ctx, parsed.id, { lockMode: LockMode.PESSIMISTIC_WRITE }),
      resolveTarget: (_parsed, record) => importTarget(record as PersonImport),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as PersonImport
}

registerCommand(createImportCommand)
registerCommand(decideRowCommand)
registerCommand(commitImportCommand)
registerCommand(cancelImportCommand)
