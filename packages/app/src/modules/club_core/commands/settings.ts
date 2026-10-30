// `club_core.settings.update` (foundation spec DD-F16, DD-F18; club spec DD-37): a partial update of the club's
// settings by the club administrator. `execute` creates the row on the first update, row-locks it and authorizes
// through `authorizeScoped` inside one write transaction; undo restores the previous values after `authorizeReplay`
// re-checks the current scope. Since #29 it also writes the club's public slug, description, phone and publication
// (glossary *Publication*): a page switched on needs the slug (422), and a slug another club holds answers 409 from
// the unique index — no lookup across clubs runs here. The logo has its own commands (`commands/logos.ts`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { assertSupportedLocale, authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { ClubSettings } from '../data/entities'
import { ensureClubSettingsRow } from '../data/queries'
import { clubSettingsUpdateSchema } from '../data/validators'
import { applyPublicationPatch, clubPublicationProblem, resolvePublication, type Publication } from '../lib/publication'
import { applyClubSettingsPatch, type ClubSettingKey, type ClubSettingsValues } from '../lib/settings'
import {
  publicSettingsOf,
  resolveStoredSettings,
  storedSettingsOf,
  type ClubPublicSettings,
} from '../services/settings'
import { isUniqueViolation } from './shared'

export const CLUB_SETTINGS_RESOURCE_KIND = 'club_core.club_settings'

/** `club_core.settings.updated`; the payload carries ids only (S4.6). */
export const clubSettingsEvents: CrudEventsConfig<ClubSettings> = {
  module: 'club_core',
  entity: 'settings',
  persistent: true,
  buildPayload: (ctx) => ({
    id: ctx.identifiers.id,
    tenantId: ctx.identifiers.tenantId,
    organizationId: ctx.identifiers.organizationId,
  }),
}

/** The stored columns before the update, as they were (an undo writes them back unchanged). */
type SettingsSnapshot = Record<ClubSettingKey, unknown> & {
  id: string
  tenantId: string
  organizationId: string
  // Public page settings (#29); absent in log entries written before #29.
  publicSlug?: string | null
  publicDescription?: string | null
  contactPhone?: string | null
  publication?: Publication
}

export type ClubSettingsUpdateResult = {
  settings: ClubSettings
  /** The effective settings after the update. */
  values: ClubSettingsValues
  publicSettings: ClubPublicSettings
  before: SettingsSnapshot
  actingRole: ActingRole
}

function snapshot(row: ClubSettings): SettingsSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    ...storedSettingsOf(row),
    publicSlug: row.publicSlug ?? null,
    publicDescription: row.publicDescription ?? null,
    contactPhone: row.contactPhone ?? null,
    publication: resolvePublication(row.publication),
  }
}

type PublicPatch = {
  publicSlug?: string | null
  publicDescription?: string | null
  contactPhone?: string | null
  publication?: Parameters<typeof applyPublicationPatch>[1]
}

/** Writes the public page settings a patch names; returns the problem that refuses the result, if any. */
function writePublicSettings(row: ClubSettings, patch: PublicPatch): 'publication_slug_required' | null {
  if (patch.publicSlug !== undefined) row.publicSlug = patch.publicSlug
  if (patch.publicDescription !== undefined) row.publicDescription = patch.publicDescription
  if (patch.contactPhone !== undefined) row.contactPhone = patch.contactPhone
  const publication = applyPublicationPatch(resolvePublication(row.publication), patch.publication)
  row.publication = publication
  return clubPublicationProblem({ publication, publicSlug: row.publicSlug ?? null })
}

function writeValues(row: ClubSettings, values: ClubSettingsValues): void {
  row.ownAccountMinAge = values.ownAccountMinAge
  row.defaultLocale = values.defaultLocale
  row.timezone = values.timezone
  row.shortName = values.shortName
  row.currency = values.currency
  row.declarationKinds = { ...values.declarationKinds }
  row.onlineFeeMode = values.onlineFeeMode
  row.onlineFeePercent = values.onlineFeePercent.toFixed(2)
  row.onlineFeeFixed = values.onlineFeeFixed
  row.coachSettlementModel = values.coachSettlementModel
  row.showCalledUpChildren = values.showCalledUpChildren
  row.orderSalesDocument = values.orderSalesDocument
  row.updatedAt = new Date()
}

const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback)
const integer = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

/** Writes a snapshot's stored columns back; a column the snapshot lacks (an older log entry) keeps its value. */
function restoreSnapshot(row: ClubSettings, before: SettingsSnapshot): void {
  row.ownAccountMinAge = integer(before.ownAccountMinAge, row.ownAccountMinAge)
  row.defaultLocale = text(before.defaultLocale, row.defaultLocale)
  row.timezone = text(before.timezone, row.timezone)
  if (before.shortName !== undefined) row.shortName = typeof before.shortName === 'string' ? before.shortName : null
  row.currency = text(before.currency, row.currency)
  if (before.declarationKinds && typeof before.declarationKinds === 'object') {
    row.declarationKinds = { ...(before.declarationKinds as Record<string, string>) }
  }
  row.onlineFeeMode = text(before.onlineFeeMode, row.onlineFeeMode)
  if (typeof before.onlineFeePercent === 'number') row.onlineFeePercent = before.onlineFeePercent.toFixed(2)
  row.onlineFeeFixed = integer(before.onlineFeeFixed, row.onlineFeeFixed)
  row.coachSettlementModel = text(before.coachSettlementModel, row.coachSettlementModel)
  row.showCalledUpChildren = text(before.showCalledUpChildren, row.showCalledUpChildren)
  row.orderSalesDocument = text(before.orderSalesDocument, row.orderSalesDocument)
  if (before.publicSlug !== undefined) row.publicSlug = before.publicSlug
  if (before.publicDescription !== undefined) row.publicDescription = before.publicDescription
  if (before.contactPhone !== undefined) row.contactPhone = before.contactPhone
  if (before.publication !== undefined) row.publication = resolvePublication(before.publication)
  row.updatedAt = new Date()
}

function settingsSpec(
  input: z.ZodType<Record<string, unknown>>,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<z.ZodType<Record<string, unknown>>, ClubSettings> {
  const trusted = trustedScopeOf(ctx)
  return {
    input,
    resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
    // Club-wide settings: only the club administrator changes them.
    allowedKinds: ['club_admin'],
    loadTarget: (_parsed, em, lock) =>
      trusted ? em.findOne(ClubSettings, { ...trusted, deletedAt: null }, lock) : Promise.resolve(null),
    resolveTarget: (_parsed, entity, scope) => ({
      id: entity?.id ?? scope.organizationId,
      tenantId: entity?.tenantId ?? scope.tenantId,
      organizationId: entity?.organizationId ?? scope.organizationId,
    }),
  }
}

const replayInputSchema = z.object({}).loose()

async function authorizeSettingsReplay(ctx: CommandRuntimeContext): Promise<ClubSettings> {
  const em = ctx.transactionalEm
  if (!em) throw new Error('[internal] club settings replay needs the replay transaction')
  const { entity } = await authorizeScoped(settingsSpec(replayInputSchema, ctx), {}, ctx, em, { mode: 'replay' })
  if (!entity) throw new Error('[internal] club settings row missing on replay')
  return entity
}

const updateClubSettingsCommand: CommandHandler<Record<string, unknown>, ClubSettingsUpdateResult> = {
  id: 'club_core.settings.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    let result: ClubSettingsUpdateResult | null = null
    try {
      await withAtomicFlush(
        em,
        [
          async () => {
            const trusted = trustedScopeOf(ctx)
            if (trusted) await ensureClubSettingsRow(em, trusted)
            const authorized = await authorizeScoped(settingsSpec(clubSettingsUpdateSchema, ctx), rawInput, ctx, em)
            const row = authorized.entity
            if (!row) throw new Error('[internal] club settings row missing after ensure')
            const before = snapshot(row)
            const current = resolveStoredSettings(row, row.organizationId).values
            const patch = authorized.parsed
            // Unknown locale → 422 `locale_unsupported` (club spec glossary *Language*); stored in its canonical form.
            const defaultLocale =
              typeof patch.defaultLocale === 'string' ? await assertSupportedLocale(patch.defaultLocale) : undefined
            const values = applyClubSettingsPatch(current, defaultLocale ? { ...patch, defaultLocale } : patch)
            writeValues(row, values)
            const problem = writePublicSettings(row, patch)
            if (problem) await clubCoreErrors.throw(problem)
            result = {
              settings: row,
              values,
              publicSettings: publicSettingsOf(row),
              before,
              actingRole: authorized.actingRole,
            }
          },
        ],
        { transaction: true, label: 'club_core.settings.update' },
      )
    } catch (error: unknown) {
      // The globally unique slug (DD-23): another club holds it.
      if (isUniqueViolation(error)) return clubCoreErrors.throw('public_slug_taken')
      throw error
    }
    const done = result as ClubSettingsUpdateResult | null
    if (!done) throw new Error('[internal] club settings update produced no result')
    await emitCrudSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: done.settings,
      identifiers: {
        id: done.settings.id,
        tenantId: done.settings.tenantId,
        organizationId: done.settings.organizationId,
      },
      events: clubSettingsEvents,
    })
    return done
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.settings.update', 'Update club settings'),
      resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
      resourceId: result.settings.id,
      tenantId: result.settings.tenantId,
      organizationId: result.settings.organizationId,
      snapshotBefore: result.before,
      snapshotAfter: snapshot(result.settings),
      context: { actingRole: result.actingRole },
    }
  },
  async authorizeReplay({ ctx }) {
    await authorizeSettingsReplay(ctx)
  },
  async undo({ logEntry, ctx }) {
    const before = logEntry.snapshotBefore as SettingsSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing club settings snapshot for undo')
    const row = await authorizeSettingsReplay(ctx)
    if (row.id !== before.id) throw new Error('[internal] club settings snapshot belongs to another row')
    restoreSnapshot(row, before)
    await ctx.transactionalEm?.flush()
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      events: clubSettingsEvents,
    })
  },
}

registerCommand(updateClubSettingsCommand)
