// `club_core.settings.update` (foundation spec DD-F16, DD-F18): a partial update of the club's settings by the club
// administrator. `execute` creates the row on the first update, row-locks it and authorizes through
// `authorizeScoped` inside one write transaction; undo restores the previous values after `authorizeReplay`
// re-checks the current scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { ClubSettings } from '../data/entities'
import { ensureClubSettingsRow } from '../data/queries'
import { clubSettingsUpdateSchema } from '../data/validators'
import type { ClubSettingsValues } from '../lib/settings'

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

type SettingsSnapshot = ClubSettingsValues & { id: string; tenantId: string; organizationId: string }

export type ClubSettingsUpdateResult = {
  settings: ClubSettings
  before: SettingsSnapshot
  actingRole: ActingRole
}

function snapshot(row: ClubSettings): SettingsSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    ownAccountMinAge: row.ownAccountMinAge,
    defaultLocale: row.defaultLocale,
    timezone: row.timezone,
  }
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
          const patch = authorized.parsed as Partial<ClubSettingsValues>
          if (patch.ownAccountMinAge !== undefined) row.ownAccountMinAge = patch.ownAccountMinAge
          if (patch.defaultLocale !== undefined) row.defaultLocale = patch.defaultLocale
          if (patch.timezone !== undefined) row.timezone = patch.timezone
          result = { settings: row, before, actingRole: authorized.actingRole }
        },
      ],
      { transaction: true, label: 'club_core.settings.update' },
    )
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
    row.ownAccountMinAge = before.ownAccountMinAge
    row.defaultLocale = before.defaultLocale
    row.timezone = before.timezone
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
