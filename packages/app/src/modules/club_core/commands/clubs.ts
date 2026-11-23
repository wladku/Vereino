// `club_core.clubs.provision` (many clubs spec phase 2, REQ-M05, DD-M08; #630): the first settings of a club the
// operator command `club_core create-club` creates — its public slug (the club address, DD-M02), time zone and default
// language — written before the modules' `seedDefaults`, which read the time zone for their schedules. A job command
// (no session; `system_job` grant of the scope the CLI names), so only the operator's shell reaches it. Idempotent for
// the same values; a slug another club holds answers 409 `public_slug_taken` from the unique index, a reserved one 400
// `slug_reserved`, and a club that already has another slug keeps it (409 `public_slug_taken`). Not undoable: it is part
// of creating the club.
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import { z } from 'zod'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { assertSupportedLocale, authorizeScoped } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { ClubSettings } from '../data/entities'
import { ensureClubSettingsRow } from '../data/queries'
import { isReservedClubSlug } from '../lib/club-onboarding'
import { publicSlugSchema } from '../lib/publication'
import { clubSettingsRuleProblem } from '../lib/settings'
import { CLUB_SETTINGS_RESOURCE_KIND, clubSettingsEvents } from './settings'
import { inWriteTransaction, isUniqueViolation } from './shared'

const provisionSchema = z
  .object({
    publicSlug: publicSlugSchema,
    timezone: z.string().trim().min(1).max(100),
    defaultLocale: z.string().trim().min(1).max(20),
  })
  .strict()

export type ProvisionClubResult = {
  settingsId: string
  tenantId: string
  organizationId: string
  publicSlug: string
  timezone: string
  defaultLocale: string
  /** False when the settings already held exactly these values. */
  changed: boolean
  actingRole: ActingRole
}

const provisionClubCommand: CommandHandler<Record<string, unknown>, ProvisionClubResult> = {
  id: 'club_core.clubs.provision',
  isUndoable: false,
  async execute(rawInput, ctx) {
    let result: ProvisionClubResult
    let settings: ClubSettings | null = null
    try {
      result = await inWriteTransaction(ctx, 'club_core.clubs.provision', async (em: EntityManager) => {
        const authorized = await authorizeScoped(
          {
            input: provisionSchema,
            resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
            allowedKinds: ['system_job'],
            resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
            lock: 'none',
            scopeSource: { job: true },
          },
          rawInput,
          ctx,
          em,
        )
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        const input = authorized.parsed
        if (isReservedClubSlug(input.publicSlug)) return clubCoreErrors.throw('slug_reserved')
        const rule = clubSettingsRuleProblem({ timezone: input.timezone })
        if (rule) return clubCoreErrors.throw(rule.code)
        const defaultLocale = await assertSupportedLocale(input.defaultLocale)
        await ensureClubSettingsRow(em, scope)
        const row = await em.findOne(
          ClubSettings,
          { ...scope, deletedAt: null },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        )
        if (!row) throw new Error('[internal] club settings row missing after ensure')
        settings = row
        if (row.publicSlug && row.publicSlug !== input.publicSlug) return clubCoreErrors.throw('public_slug_taken')
        const changed =
          row.publicSlug !== input.publicSlug || row.timezone !== input.timezone || row.defaultLocale !== defaultLocale
        if (changed) {
          row.publicSlug = input.publicSlug
          row.timezone = input.timezone
          row.defaultLocale = defaultLocale
          row.updatedAt = new Date()
          await em.flush()
        }
        return {
          settingsId: row.id,
          ...scope,
          publicSlug: input.publicSlug,
          timezone: input.timezone,
          defaultLocale,
          changed,
          actingRole: authorized.actingRole,
        }
      })
    } catch (error: unknown) {
      // The globally unique slug (DD-23): another club holds it.
      if (isUniqueViolation(error)) return clubCoreErrors.throw('public_slug_taken')
      throw error
    }
    if (result.changed && settings) {
      await emitCrudSideEffects({
        dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
        action: 'updated',
        entity: settings,
        identifiers: { id: result.settingsId, tenantId: result.tenantId, organizationId: result.organizationId },
        events: clubSettingsEvents,
      })
    }
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.clubs.provision', 'Set up the club address'),
      resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
      resourceId: result.settingsId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        publicSlug: result.publicSlug,
        timezone: result.timezone,
        defaultLocale: result.defaultLocale,
        changed: result.changed,
      },
    }
  },
}

registerCommand(provisionClubCommand)
