// `groups.age_category_ranges.set` and `groups.age_categories.create` (people life-cycle spec REQ-L16, DD-L17, *API*
// rows; #384): the PZPN "U" range of an age category, kept in `groups_age_category_ranges` and keyed by the entry of
// the club's `dictionaries` age category dictionary, so a renamed category keeps its range. Only the club
// administrator writes them (the routes need `dictionaries.manage`, the commands the `club_admin` grant); "U od" above
// "U do" answers 422 `age_range_inverted`. The create adds the dictionary entry and its range in one transaction (409
// `age_category_name_taken` when the dictionary already has that name).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { DictionaryEntry } from '@open-mercato/core/modules/dictionaries/data/entities'
import { normalizeDictionaryValue } from '@open-mercato/core/modules/dictionaries/lib/utils'
import type { GrantKind } from '@vereino/core'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { AgeCategoryRange } from '../data/entities'
import { ageCategoryCreateSchema, ageCategoryRangeSetSchema } from '../data/validators'
import { ageCategoryRangeInverted } from '../lib/groups-rules'
import { findAgeCategoryDictionary } from '../services/age-categories'
import { dictionaryTarget, groupsLog, inWriteTransaction, isUniqueViolation, type GroupsCommandResult } from './shared'

export const AGE_CATEGORY_RANGE_RESOURCE_KIND = 'groups.age_category_range'
export const AGE_CATEGORY_RESOURCE_KIND = 'groups.age_category'

/** The club's dictionaries are the club administrator's (a coordinator reads the ranges, never writes them). */
const RANGE_WRITE_KINDS: readonly GrantKind[] = ['club_admin']

export type AgeCategoryRangeSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  entryId: string
  uFrom: number
  uTo: number | null
}

export type AgeCategoryRangeResult = GroupsCommandResult<AgeCategoryRange, AgeCategoryRangeSnapshot>

export type AgeCategoryCreateResult = AgeCategoryRangeResult & {
  entry: { id: string; value: string; label: string }
}

export function ageCategoryRangeSnapshot(row: AgeCategoryRange): AgeCategoryRangeSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    entryId: row.entryId,
    uFrom: row.uFrom,
    uTo: row.uTo ?? null,
  }
}

/** The target of a range write: the row-locked dictionary entry and its live range (none before the first write). */
type RangeTarget = { id: string; updatedAt: Date | null; range: AgeCategoryRange | null }

/** An entry of the club's age category dictionary, row-locked with its range; null (404) for any other id. */
async function loadRangeTarget(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  entryId: string,
  lock: TargetLock,
): Promise<RangeTarget | null> {
  const scope = trustedScopeOf(ctx)
  if (!scope) return null
  const dictionary = await findAgeCategoryDictionary(em, scope)
  if (!dictionary) return null
  const entry = await em.findOne(DictionaryEntry, { id: entryId, ...scope, dictionary }, { ...lock, fields: ['id'] })
  if (!entry) return null
  const range = await em.findOne(AgeCategoryRange, { ...scope, entryId, deletedAt: null }, lock)
  return { id: entry.id, updatedAt: range?.updatedAt ?? null, range }
}

async function assertRange(uFrom: number, uTo: number | null): Promise<void> {
  if (ageCategoryRangeInverted({ uFrom, uTo })) await groupsErrors.throw('age_range_inverted')
}

const setRangeCommand: CommandHandler<Record<string, unknown>, AgeCategoryRangeResult> = {
  id: 'groups.age_category_ranges.set',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'groups.age_category_ranges.set', async (em) => {
      const authorized = await authorizeScoped<typeof ageCategoryRangeSetSchema, RangeTarget>(
        {
          input: ageCategoryRangeSetSchema,
          resourceKind: AGE_CATEGORY_RANGE_RESOURCE_KIND,
          allowedKinds: RANGE_WRITE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadRangeTarget(ctx, txEm, parsed.entryId, lock),
          resolveTarget: (_parsed, target, scope) => dictionaryTarget({ id: String(target?.id), ...scope }),
          expectedUpdatedAt: (parsed) => parsed.updatedAt,
          // The first range of an entry has no version the client could have read.
          acceptsMissingToken: (target) => target.range === null,
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const uTo = parsed.uTo ?? null
      await assertRange(parsed.uFrom, uTo)
      const existing = (authorized.entity as RangeTarget).range
      const before = existing ? ageCategoryRangeSnapshot(existing) : null
      const row =
        existing ??
        em.create(AgeCategoryRange, { tenantId, organizationId, entryId: parsed.entryId, uFrom: parsed.uFrom })
      row.uFrom = parsed.uFrom
      row.uTo = uTo
      row.updatedAt = new Date()
      em.persist(row)
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: AGE_CATEGORY_RANGE_RESOURCE_KIND,
      labelKey: 'groups.audit.ageCategoryRanges.set',
      fallback: 'Set an age category range',
      after: ageCategoryRangeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeRangeReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeRangeReplay(ctx, logEntry.resourceId)
    const before = logEntry.snapshotBefore as AgeCategoryRangeSnapshot | null | undefined
    if (before?.id) {
      row.uFrom = before.uFrom
      row.uTo = before.uTo
    } else {
      // The first range of the entry: the undo takes it away again.
      row.deletedAt = new Date()
    }
    row.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
  },
}

/** The range row of an undo or a redo, checked against the current scope (club administrator only). */
async function authorizeRangeReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<AgeCategoryRange> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] age category range replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: AGE_CATEGORY_RANGE_RESOURCE_KIND,
      allowedKinds: RANGE_WRITE_KINDS,
      loadTarget: (parsed, txEm, lock) => {
        const scope = trustedScopeOf(ctx)
        return scope ? txEm.findOne(AgeCategoryRange, { id: parsed.id, ...scope }, lock) : Promise.resolve(null)
      },
      resolveTarget: (_parsed, row, scope) => dictionaryTarget({ id: String(row?.id), ...scope }),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as AgeCategoryRange
}

const createCategoryCommand: CommandHandler<Record<string, unknown>, AgeCategoryCreateResult> = {
  id: 'groups.age_categories.create',
  // The entry lives in the platform dictionary, which deletes entries for good; it is removed on the dictionary page.
  isUndoable: false,
  async execute(rawInput, ctx) {
    const entryId = randomUUID()
    return inWriteTransaction(ctx, 'groups.age_categories.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: ageCategoryCreateSchema,
          resourceKind: AGE_CATEGORY_RESOURCE_KIND,
          allowedKinds: RANGE_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => dictionaryTarget({ id: entryId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const uTo = parsed.uTo ?? null
      await assertRange(parsed.uFrom, uTo)
      const dictionary = await findAgeCategoryDictionary(em, scope)
      if (!dictionary || !dictionary.isActive) return groupsErrors.throw('age_categories_missing')
      const normalizedValue = normalizeDictionaryValue(parsed.label)
      const entries = await em.find(
        DictionaryEntry,
        { ...scope, dictionary },
        { fields: ['id', 'label', 'normalizedValue'] },
      )
      const labelKey = parsed.label.toLocaleLowerCase('pl')
      if (
        entries.some(
          (entry) => entry.normalizedValue === normalizedValue || entry.label.toLocaleLowerCase('pl') === labelKey,
        )
      ) {
        return groupsErrors.throw('age_category_name_taken')
      }
      const now = new Date()
      const position = entries.length
      const entry = em.create(DictionaryEntry, {
        id: entryId,
        ...scope,
        dictionary,
        value: parsed.label,
        normalizedValue,
        label: parsed.label,
        color: null,
        icon: null,
        position,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      })
      const range = em.create(AgeCategoryRange, { ...scope, entryId, uFrom: parsed.uFrom, uTo })
      em.persist(entry)
      em.persist(range)
      try {
        await em.flush()
      } catch (error: unknown) {
        if (isUniqueViolation(error)) return groupsErrors.throw('age_category_name_taken')
        throw error
      }
      return {
        entity: range,
        entry: { id: entry.id, value: entry.value, label: entry.label },
        actingRole: authorized.actingRole,
        before: null,
      }
    })
  },
  async buildLog({ result }) {
    const log = await groupsLog({
      result,
      resourceKind: AGE_CATEGORY_RANGE_RESOURCE_KIND,
      labelKey: 'groups.audit.ageCategories.create',
      fallback: 'Add an age category',
      after: ageCategoryRangeSnapshot(result.entity),
    })
    // The entry is written past the platform command, so the bus also flushes the cached entry lists of
    // `GET /api/dictionaries/{id}/entries` (resource `dictionaries.entry`) after the commit.
    return { ...log, context: { ...log.context, cacheAliases: ['dictionaries.entry'] } }
  },
}

registerCommand(setRangeCommand)
registerCommand(createCategoryCommand)
