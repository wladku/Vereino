import { spawnSync } from 'node:child_process'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { deleteOrganizationIfExists, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, call, mercato, uniqueSuffix } from '../_fixtures/club'
import { getSettings, publicGet, publish, putSettings } from '../_fixtures/publication'

// TEST-M01 (many clubs spec phase 2, REQ-M05, REQ-M01, AC-M01, AC-M05; E22-S04, #630): `club_core create-club` creates a
// club on the shared instance in one run — its own tenant and organization, address, settings, the `vereino_*` roles,
// the PZPN age categories, the per-club schedules and a first administrator invited by e-mail — and a second run with
// the same slug changes nothing. Two clubs are two tenants with the same role keys; the administrator signs in, publishes
// the club page, and the club's jobs run. A reserved or malformed slug and a taken administrator e-mail stop the command
// before anything is written.
test.describe.configure({ timeout: 600_000 })

type Created = {
  status: 'created'
  slug: string
  tenantId: string
  organizationId: string
  address: string | null
  adminUserId: string
  adminPersonId: string
  roles: string[]
  schedules: string[]
  invitation: { expiresAt: string; warning?: string }
}

/** `yarn mercato club_core create-club …`: the exit code and the JSON line it printed. */
function createClubCli(args: string[]): { exitCode: number | null; output: Record<string, unknown> | null } {
  const run = spawnSync('yarn', ['mercato', 'club_core', 'create-club', ...args], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 300_000,
  })
  const line = run.stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.trim().startsWith('{'))
  return { exitCode: run.status, output: line ? (JSON.parse(line) as Record<string, unknown>) : null }
}

function clubArgs(slug: string, email: string, name: string): string[] {
  return [
    '--slug',
    slug,
    '--name',
    name,
    '--admin-email',
    email,
    '--admin-first-name',
    'Ada',
    '--admin-last-name',
    'Admin',
    '--timezone',
    'Europe/Warsaw',
    '--locale',
    'pl',
  ]
}

async function tenantCount(): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(`select count(*)::text as count from tenants`)
    return Number(rows[0]?.count ?? 0)
  })
}

async function pendingInvitations(userId: string): Promise<{ expires_at: Date }[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ expires_at: Date }>(
      `select expires_at from password_resets where user_id = $1 and used_at is null`,
      [userId],
    )
    return rows
  })
}

async function ageCategoryCount(scope: { tenantId: string; organizationId: string }): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from dictionary_entries e join dictionaries d on d.id = e.dictionary_id
        where d.tenant_id = $1 and d.organization_id = $2 and d.key = 'groups.age_categories'`,
      [scope.tenantId, scope.organizationId],
    )
    return Number(rows[0]?.count ?? 0)
  })
}

/** Sets a password for the invited administrator (what following the invitation link does) and signs in. */
async function acceptInvitation(request: APIRequestContext, superToken: string, club: Created, email: string) {
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const reset = await call(request, 'PUT', '/api/auth/users', superToken, {
    data: { id: club.adminUserId, password },
  })
  expect(reset.status, `PUT /api/auth/users ${JSON.stringify(reset.body)}`).toBe(200)
  return getAuthToken(request, email, password)
}

test('TEST-M01 create-club creates a working club per tenant, once', async ({ request }) => {
  const superToken = await getAuthToken(request, 'superadmin')
  const suffix = uniqueSuffix()
  const slugA = `m01-a-${suffix}`
  const slugB = `m01-b-${suffix}`
  const emailA = `m01-a-${suffix}@example.org`
  const emailB = `m01-b-${suffix}@example.org`
  const created: Created[] = []
  try {
    // Refused before anything is written: a reserved slug, a malformed one, a missing option.
    const tenantsBefore = await tenantCount()
    const reserved = createClubCli(clubArgs('admin', emailA, 'Reserved'))
    expect(reserved.exitCode).toBe(1)
    expect(reserved.output).toEqual({ status: 'invalid', problems: [{ option: 'slug', problem: 'reserved' }] })
    const malformed = createClubCli(['--slug', 'ks orzeł', '--name', 'X'])
    expect(malformed.exitCode).toBe(1)
    expect(malformed.output?.problems).toEqual(
      expect.arrayContaining([
        { option: 'slug', problem: 'invalid' },
        { option: 'admin-email', problem: 'required' },
      ]),
    )
    // A dry run checks and writes nothing.
    const dry = createClubCli([...clubArgs(slugA, emailA, `M01 A ${suffix}`), '--dry-run'])
    expect(dry.exitCode).toBe(0)
    expect(dry.output).toMatchObject({ status: 'dry-run', slug: slugA, problems: [] })
    expect(await tenantCount()).toBe(tenantsBefore)

    // Club A in one run.
    const runA = createClubCli(clubArgs(slugA, emailA, `M01 A ${suffix}`))
    expect(runA.exitCode, JSON.stringify(runA.output)).toBe(0)
    const clubA = runA.output as Created
    created.push(clubA)
    expect(clubA).toMatchObject({ status: 'created', slug: slugA })
    expect(clubA.address === null || clubA.address.endsWith(`/p/${slugA}`) || clubA.address.includes(slugA)).toBe(true)
    expect(clubA.roles).toEqual(expect.arrayContaining(['admin', 'employee', 'vereino_club_admin', 'vereino_member']))
    expect(clubA.roles).not.toContain('superadmin')
    expect(clubA.schedules).toEqual(
      expect.arrayContaining([
        'activities:generate-occurrences',
        'facilities:rental-lifecycle',
        'foundation:dispatch-sweep',
        'payments:generate-charges',
        'people:life-cycle',
        'people:sync-role-expiry',
      ]),
    )
    expect(clubA.invitation.warning).toBeUndefined()
    // The invitation is a one-time link of about 48 hours; no password was set.
    const invitations = await pendingInvitations(clubA.adminUserId)
    expect(invitations).toHaveLength(1)
    const hours = (new Date(invitations[0].expires_at).getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(47)
    expect(hours).toBeLessThanOrEqual(48)
    // The PZPN age categories were seeded.
    expect(await ageCategoryCount(clubA)).toBeGreaterThan(0)

    // A second run with the same slug changes nothing and says so.
    const tenantsAfterA = await tenantCount()
    const again = createClubCli(clubArgs(slugA, emailA, `M01 A ${suffix}`))
    expect(again.exitCode).toBe(0)
    expect(again.output).toMatchObject({
      status: 'exists',
      slug: slugA,
      tenantId: clubA.tenantId,
      organizationId: clubA.organizationId,
    })
    expect(await tenantCount()).toBe(tenantsAfterA)
    expect(await pendingInvitations(clubA.adminUserId)).toHaveLength(1)

    // An administrator e-mail that already has an account stops a new club before anything is written.
    const taken = createClubCli(clubArgs(slugB, emailA, `M01 B ${suffix}`))
    expect(taken.exitCode).toBe(1)
    expect(taken.output).toEqual({ status: 'refused', reason: 'admin_email_taken' })
    expect(await tenantCount()).toBe(tenantsAfterA)

    // Club B: its own tenant, the same role keys.
    const runB = createClubCli(clubArgs(slugB, emailB, `M01 B ${suffix}`))
    expect(runB.exitCode, JSON.stringify(runB.output)).toBe(0)
    const clubB = runB.output as Created
    created.push(clubB)
    expect(clubB.tenantId).not.toBe(clubA.tenantId)
    expect(clubB.organizationId).not.toBe(clubA.organizationId)
    expect(clubB.roles).toEqual(clubA.roles)

    // The administrator signs in to their own club and publishes its page.
    const tokenA = await acceptInvitation(request, superToken, clubA, emailA)
    const settingsA = await getSettings(request, tokenA)
    expect(settingsA.publicSlug).toBe(slugA)
    expect((settingsA as unknown as { timezone: string }).timezone).toBe('Europe/Warsaw')
    const reservedSlug = await putSettings(request, tokenA, { publicSlug: 'status' })
    expect(reservedSlug.status, JSON.stringify(reservedSlug.body)).toBe(400)
    expect(reservedSlug.body?.code).toBe('slug_reserved')
    expect((await publicGet(request, `/api/club_core/public/${slugA}`)).status).toBe(404)
    await publish(request, tokenA, slugA, ['contact'])
    const page = await publicGet(request, `/api/club_core/public/${slugA}`)
    expect(page.status).toBe(200)
    expect((page.body as { club: { slug: string } }).club.slug).toBe(slugA)

    // Club A's administrator sees only club A's people.
    const people = await call<{ items: { id: string }[] }>(request, 'GET', '/api/people/persons', tokenA)
    expect(people.status).toBe(200)
    expect(people.body?.items.map((item) => item.id)).toEqual([clubA.adminPersonId])

    // Finishing a club (`--tenant`/`--org`, after an `incomplete` run) re-runs the idempotent steps for that club only:
    // the administrator who has a password gets no new invitation; another club's slug is refused.
    const scopeA = ['--tenant', clubA.tenantId, '--org', clubA.organizationId]
    const finish = createClubCli([...clubArgs(slugA, emailA, `M01 A ${suffix}`), ...scopeA])
    expect(finish.exitCode, JSON.stringify(finish.output)).toBe(0)
    expect(finish.output).toMatchObject({
      status: 'completed',
      tenantId: clubA.tenantId,
      adminPersonId: clubA.adminPersonId,
      invitation: null,
    })
    expect((finish.output as unknown as Created).roles).toEqual(clubA.roles)
    expect((finish.output as unknown as Created).schedules).toEqual(clubA.schedules)
    const wrongClub = createClubCli([...clubArgs(slugB, emailA, `M01 A ${suffix}`), ...scopeA])
    expect(wrongClub.exitCode).toBe(1)
    expect(wrongClub.output).toEqual({ status: 'refused', reason: 'public_slug_taken' })

    // The club's jobs run: one run of the daily role sync, as the scheduler runs it.
    const sync = mercato(['people', 'sync-role-expiry', '--tenant', clubA.tenantId, '--org', clubA.organizationId]) as {
      tenantId?: string
      organizationId?: string
    } | null
    expect(sync).toMatchObject({ tenantId: clubA.tenantId, organizationId: clubA.organizationId })
  } finally {
    for (const club of created) {
      await deleteUserIfExists(request, superToken, club.adminUserId)
      await deleteOrganizationIfExists(request, superToken, club.organizationId)
      await call(request, 'DELETE', '/api/directory/tenants', superToken, { data: { id: club.tenantId } }).catch(
        () => undefined,
      )
    }
  }
})
