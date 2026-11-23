// Creating a club on the shared instance with one command (many clubs spec phase 2, REQ-M05, REQ-M01, DD-M01, DD-M08;
// J-M01; #630). One club is one tenant with one organization: the platform's own `setupInitialTenant` creates them,
// with the tenant's data-encryption key, the encryption maps, the platform roles and the `onTenantCreated` hooks, and the
// club's administrator as a user without a password. Then, in order: the club's address and first settings
// (`club_core.clubs.provision`, before the schedules read the time zone), every module's `seedDefaults` as `mercato
// init` runs them (the `vereino_*` roles, the PZPN age categories, the per-club schedules) and the custom role ACLs,
// the first club administrator (`people.persons.bootstrap_admin`), the invitation e-mail and `club_core.club.created`.
//
// Idempotent by slug: a slug a club already holds changes nothing and answers `exists` (found through the approved
// slug lookup, D-024). A slug or administrator e-mail that is taken stops the command before anything is written. A
// run that stopped after the tenant was created (`incomplete`) is finished with `--tenant`/`--org`, which runs the
// remaining idempotent steps for that organization only.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Role, User } from '@open-mercato/core/modules/auth/data/entities'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { emailHashLookupValues } from '@open-mercato/core/modules/auth/lib/emailHash'
import {
  ensureCustomRoleAcls,
  OrgSlugExistsError,
  setupInitialTenant,
} from '@open-mercato/core/modules/auth/lib/setup-app'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { jobCommandContext, sendAccountInvitation, type AccountInvitationResult } from '@/modules/foundation'
import { lookupClubByPublicSlug } from '../data/queries'
import { eventsConfig } from '../events'
import { clubAddress, type CreateClubOptions } from '../lib/club-onboarding'

/** The platform role the club's administrator holds besides the `vereino_*` roles the role sync gives them. */
export const CLUB_ADMIN_PLATFORM_ROLE = 'admin'

export type ClubScope = { tenantId: string; organizationId: string }

export type CreatedClub = {
  slug: string
  tenantId: string
  organizationId: string
  address: string | null
  adminUserId: string
  adminPersonId: string
  roles: string[]
  schedules: string[]
  /** Null when the administrator already has a password (a finished club). */
  invitation: AccountInvitationResult | null
}

export type CreateClubOutcome =
  | ({ status: 'created' | 'completed' } & CreatedClub)
  | { status: 'exists'; slug: string; tenantId: string; organizationId: string; address: string | null }
  | { status: 'dry-run'; slug: string; address: string | null; problems: CreateClubRefusal['reason'][] }

/** Why the command stops before writing anything. */
export type CreateClubRefusal = {
  status: 'refused'
  reason:
    'admin_email_taken' | 'organization_slug_taken' | 'public_slug_taken' | 'organization_not_found' | 'admin_not_found'
}

/** Thrown when a step after the tenant was created fails: names the club so the operator can finish it by hand. */
export class CreateClubIncompleteError extends Error {
  constructor(
    readonly scope: ClubScope,
    readonly step: string,
    readonly failure: unknown,
  ) {
    super(`club ${scope.organizationId} (tenant ${scope.tenantId}) was created but step "${step}" failed`)
  }
}

type BootstrapAdminResult = { personId: string }

function emOf(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

async function adminEmailTaken(container: AwilixContainer, email: string): Promise<boolean> {
  const user = await findOneWithDecryption(
    emOf(container),
    User,
    { emailHash: { $in: emailHashLookupValues(email) }, deletedAt: null },
    {},
    { tenantId: null, organizationId: null },
  )
  return user !== null
}

/** Runs one step of a created club; a failure names the club and the step (`CreateClubIncompleteError`). */
async function step<T>(scope: ClubScope, name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    throw new CreateClubIncompleteError(scope, name, error)
  }
}

/** The modules' `seedDefaults`, then the custom role ACLs, as `mercato init` runs them for a new organization. */
async function seedModuleDefaults(container: AwilixContainer, scope: ClubScope): Promise<void> {
  const modules = getCliModules()
  const em = emOf(container)
  for (const mod of modules) {
    if (mod.setup?.seedDefaults) await mod.setup.seedDefaults({ em, ...scope, container })
  }
  await ensureCustomRoleAcls(em, scope.tenantId, modules)
}

/** Role names of the tenant and the per-club schedules of the organization, for the operator's report. */
async function clubInventory(container: AwilixContainer, scope: ClubScope) {
  const em = emOf(container)
  const roles = await em.find(Role, { tenantId: scope.tenantId, deletedAt: null }, { fields: ['name'] })
  const schedules = await em.execute<{ name: string }[]>(
    `select name from scheduled_jobs where tenant_id = ? and organization_id = ? and deleted_at is null order by name`,
    [scope.tenantId, scope.organizationId],
  )
  return { roles: roles.map((role) => role.name).sort(), schedules: schedules.map((row) => row.name) }
}

/**
 * The steps after the tenant exists, in order; each is idempotent, so `--tenant`/`--org` can run them again for a club
 * whose first run stopped halfway. The invitation goes out only while the administrator has no password.
 */
async function finishClub(
  container: AwilixContainer,
  options: CreateClubOptions,
  scope: ClubScope,
  admin: { id: string; hasPassword: boolean },
  address: string | null,
) {
  const commandBus = container.resolve<CommandBus>('commandBus')
  const jobCtx = jobCommandContext(container, scope)
  await step(scope, 'settings', () =>
    commandBus.execute('club_core.clubs.provision', {
      input: { publicSlug: options.slug, timezone: options.timezone, defaultLocale: options.locale },
      ctx: jobCtx,
    }),
  )
  await step(scope, 'module defaults', () => seedModuleDefaults(container, scope))
  const boot = await step(scope, 'club administrator', async () => {
    const { result } = await commandBus.execute<Record<string, unknown>, BootstrapAdminResult>(
      'people.persons.bootstrap_admin',
      {
        input: {
          userId: admin.id,
          firstName: options.adminFirstName,
          lastName: options.adminLastName,
          email: options.adminEmail,
        },
        ctx: jobCtx,
      },
    )
    return result
  })
  const invitation = admin.hasPassword
    ? null
    : await step(scope, 'invitation', () => sendAccountInvitation(container, scope, admin.id, options.name))
  await step(scope, 'event', () =>
    eventsConfig.emit('club_core.club.created', { id: scope.organizationId, ...scope }, { persistent: true }),
  )
  return {
    slug: options.slug,
    ...scope,
    address,
    adminUserId: admin.id,
    adminPersonId: boot.personId,
    ...(await clubInventory(container, scope)),
    invitation,
  }
}

/** A club's tenant, organization and administrator for `--tenant`/`--org`, or why they cannot be finished. */
async function resumeTarget(
  container: AwilixContainer,
  options: CreateClubOptions,
  scope: ClubScope,
): Promise<{ id: string; hasPassword: boolean } | CreateClubRefusal> {
  const em = emOf(container)
  const organization = await em.findOne(Organization, {
    id: scope.organizationId,
    tenant: scope.tenantId,
    deletedAt: null,
  })
  if (!organization) return { status: 'refused', reason: 'organization_not_found' }
  const user = await findOneWithDecryption(
    em,
    User,
    { ...scope, emailHash: { $in: emailHashLookupValues(options.adminEmail) }, deletedAt: null },
    {},
    scope,
  )
  if (!user) return { status: 'refused', reason: 'admin_not_found' }
  return { id: user.id, hasPassword: Boolean(user.passwordHash) }
}

/**
 * Creates the club described by `options` (already validated by `parseCreateClubOptions`), reports that its slug is
 * held by an existing club, or — with `options.resume` — finishes a club whose first run stopped halfway. `env` gives
 * the club domain or `APP_URL` for the printed address.
 */
export async function createClub(
  container: AwilixContainer,
  options: CreateClubOptions,
  env: Readonly<Record<string, string | undefined>>,
): Promise<CreateClubOutcome | CreateClubRefusal> {
  const address = clubAddress(options.slug, env)
  const existing = await lookupClubByPublicSlug(emOf(container), options.slug)
  const resume = options.resume
  if (existing && !resume) {
    return {
      status: 'exists',
      slug: options.slug,
      tenantId: existing.tenantId,
      organizationId: existing.organizationId,
      address,
    }
  }
  if (resume) {
    if (existing && existing.organizationId !== resume.organizationId) {
      return { status: 'refused', reason: 'public_slug_taken' }
    }
    const admin = await resumeTarget(container, options, resume)
    if ('status' in admin) return admin
    if (options.dryRun) return { status: 'dry-run', slug: options.slug, address, problems: [] }
    return { status: 'completed', ...(await finishClub(container, options, resume, admin, address)) }
  }
  if (options.dryRun) {
    const problems: CreateClubRefusal['reason'][] = []
    if (await adminEmailTaken(container, options.adminEmail)) problems.push('admin_email_taken')
    return { status: 'dry-run', slug: options.slug, address, problems }
  }

  let scope: ClubScope
  let adminUserId: string
  try {
    const setup = await setupInitialTenant(emOf(container), {
      orgName: options.name,
      orgSlug: options.slug,
      primaryUser: {
        email: options.adminEmail,
        displayName: `${options.adminFirstName} ${options.adminLastName}`,
        confirm: true,
      },
      primaryUserRoles: [CLUB_ADMIN_PLATFORM_ROLE],
      includeSuperadminRole: false,
      includeDerivedUsers: false,
      // An e-mail that already has an account anywhere would make the platform reuse that user's tenant.
      failIfUserExists: true,
      modules: getCliModules(),
    })
    scope = { tenantId: setup.tenantId, organizationId: setup.organizationId }
    const admin = setup.users.find((snapshot) => snapshot.roles.includes(CLUB_ADMIN_PLATFORM_ROLE))
    if (!admin)
      throw new CreateClubIncompleteError(scope, 'administrator', new Error('[internal] no administrator user'))
    adminUserId = admin.user.id
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'USER_EXISTS') {
      return { status: 'refused', reason: 'admin_email_taken' }
    }
    if (error instanceof OrgSlugExistsError) return { status: 'refused', reason: 'organization_slug_taken' }
    throw error
  }
  return {
    status: 'created',
    ...(await finishClub(container, options, scope, { id: adminUserId, hasPassword: false }, address)),
  }
}
