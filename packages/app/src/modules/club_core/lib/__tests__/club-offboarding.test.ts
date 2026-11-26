import { describe, expect, it } from '@jest/globals'
import {
  CLUB_ARCHIVE_FORMAT,
  CLUB_ARCHIVE_VERSION,
  CLUB_EXPORT_REDACTED_COLUMNS,
  OFFBOARDING_NOTICE_DAYS_DEFAULT,
  PLATFORM_CLUB_TABLES,
  SLUG_RESERVATION_DAYS,
  archiveScopeViolations,
  clubTables,
  countsByModule,
  encryptedRowKeys,
  fileEntryName,
  missingTables,
  moduleEntryName,
  offboardingDates,
  offboardingState,
  orderForInsert,
  parseDeleteOptions,
  parseExportOptions,
  parseManifest,
  parseOffboardOptions,
  parseRestoreOptions,
  parseRowJson,
  presentTables,
  redactExportRow,
  safeAttachmentLocation,
  sanitizeRestoreRow,
  isTenantRestrictedFeature,
  slugReleaseAt,
  uncoveredTables,
  type ClubArchiveManifest,
  type ClubTableKey,
} from '../club-offboarding'

const DAY = 86_400_000
const TENANT = '6bc8c0c1-59b7-4ec9-9cd0-81995d404d86'
const ORG = 'c7fdbb54-0491-4325-a2a8-90d163c43d91'
const FILE = '0b7e3c4a-1111-4222-8333-944455556666'
const SUM = 'a'.repeat(64)
const OTHER_TENANT = '9d3b1f7e-2c4a-4b6d-8e0f-1a2b3c4d5e6f'
const USER = '1f2e3d4c-5b6a-4798-8a6b-5c4d3e2f1a0b'

describe('clubTables', () => {
  it('lists the modules tables as tenant data, then the platform tables', () => {
    const tables = clubTables([{ module: 'payments', tables: ['payments_fees'] }])
    expect(tables[0]).toEqual({ module: 'payments', table: 'payments_fees', key: 'tenant', kind: 'data' })
    expect(tables.slice(1)).toEqual(PLATFORM_CLUB_TABLES)
  })

  it('keys the tenant row by id and the sign-in tables by user, and keeps secrets out of the export', () => {
    const byName = new Map(PLATFORM_CLUB_TABLES.map((entry) => [entry.table, entry]))
    expect(byName.get('tenants')).toMatchObject({ key: 'tenant_row', kind: 'data' })
    expect(byName.get('user_roles')).toMatchObject({ key: 'user', kind: 'data' })
    expect(byName.get('sessions')).toMatchObject({ key: 'user', kind: 'secret' })
    expect(byName.get('integration_credentials')).toMatchObject({ key: 'tenant', kind: 'secret' })
    expect(byName.get('search_tokens')).toMatchObject({ key: 'tenant', kind: 'derived' })
  })

  it('keys the user-owned rows with a nullable tenant by tenant or user (#681)', () => {
    const byName = new Map(PLATFORM_CLUB_TABLES.map((entry) => [entry.table, entry]))
    for (const table of ['user_consents', 'user_sidebar_preferences', 'sidebar_variants']) {
      expect(byName.get(table)).toEqual({ module: 'auth', table, key: 'tenant_or_user', kind: 'data' })
    }
    expect(byName.get('role_sidebar_preferences')).toMatchObject({ key: 'tenant' })
  })

  it('refuses a table claimed twice', () => {
    expect(() =>
      clubTables([
        { module: 'a', tables: ['shared'] },
        { module: 'b', tables: ['shared'] },
      ]),
    ).toThrow('two owners: shared / a / b')
    expect(() => clubTables([{ module: 'people', tables: ['users'] }])).toThrow('two owners: users / people / auth')
  })
})

describe('uncoveredTables and missingTables', () => {
  const covered = clubTables([{ module: 'payments', tables: ['payments_fees'] }])

  it('covers the run-time vector_search table, as an index, whether or not the database has it yet (QA on #677)', () => {
    expect(covered.find((entry) => entry.table === 'vector_search')).toEqual({
      module: 'search',
      table: 'vector_search',
      key: 'tenant',
      kind: 'derived',
      optional: true,
    })
    expect(uncoveredTables(['vector_search'], covered)).toEqual([])
    const withoutIt = covered.map((entry) => entry.table).filter((table) => table !== 'vector_search')
    expect(missingTables(withoutIt, covered)).toEqual([])
    expect(presentTables(withoutIt, covered).map((entry) => entry.table)).not.toContain('vector_search')
    const withIt = covered.map((entry) => entry.table)
    expect(presentTables(withIt, covered)).toEqual(covered)
  })

  it('names the tenant tables no list covers, sorted', () => {
    expect(uncoveredTables(['payments_fees', 'users', 'z_new', 'a_new'], covered)).toEqual(['a_new', 'z_new'])
  })

  it('names the listed tables the database does not have, sorted', () => {
    const existing = covered.map((entry) => entry.table).filter((table) => table !== 'users' && table !== 'api_keys')
    expect(missingTables(existing, covered)).toEqual(['api_keys', 'users'])
  })
})

describe('orderForInsert', () => {
  it('puts referenced tables first and keeps the given order otherwise', () => {
    const order = orderForInsert(
      ['sessions', 'users', 'organizations', 'tenants', 'other'],
      [
        { table: 'sessions', references: 'users' },
        { table: 'organizations', references: 'tenants' },
        { table: 'users', references: 'users' },
        { table: 'outside', references: 'users' },
        { table: 'sessions', references: 'outside' },
      ],
    )
    expect(order).toEqual(['users', 'sessions', 'tenants', 'organizations', 'other'])
  })

  it('throws on a cycle', () => {
    expect(() =>
      orderForInsert(
        ['a', 'b'],
        [
          { table: 'a', references: 'b' },
          { table: 'b', references: 'a' },
        ],
      ),
    ).toThrow('cycle among: a, b')
  })
})

describe('notice period', () => {
  const now = new Date('2026-11-23T10:00:00.000Z')

  it('dates the deletion the notice days after the notice', () => {
    expect(offboardingDates(now, 30)).toEqual({
      noticeAt: now,
      deleteAfter: new Date(now.getTime() + 30 * DAY),
    })
  })

  it('allows deletion only after a notice whose period has ended', () => {
    const deleteAfter = new Date(now.getTime() + DAY)
    expect(offboardingState(null, now)).toEqual({ state: 'active' })
    expect(offboardingState(undefined, now)).toEqual({ state: 'active' })
    expect(offboardingState(deleteAfter, now)).toEqual({ state: 'notice', deleteAfter })
    expect(offboardingState(deleteAfter, deleteAfter)).toEqual({ state: 'due', deleteAfter })
  })

  it('reserves a deleted club slug for 90 days', () => {
    expect(SLUG_RESERVATION_DAYS).toBe(90)
    expect(slugReleaseAt(now)).toEqual(new Date(now.getTime() + 90 * DAY))
  })
})

describe('command options', () => {
  it('offboard-club: a slug, 30 days by default, 30 to 365 days, and --cancel', () => {
    expect(parseOffboardOptions({ slug: ' Orlik ' })).toEqual({
      ok: true,
      options: { slug: 'orlik', noticeDays: OFFBOARDING_NOTICE_DAYS_DEFAULT, cancel: false },
    })
    expect(parseOffboardOptions({ slug: 'orlik', 'notice-days': '60', cancel: true })).toEqual({
      ok: true,
      options: { slug: 'orlik', noticeDays: 60, cancel: true },
    })
    for (const days of ['29', '366', '3.5', 'x']) {
      expect(parseOffboardOptions({ slug: 'orlik', 'notice-days': days })).toEqual({
        ok: false,
        problems: [{ option: 'notice-days', problem: 'invalid' }],
      })
    }
    expect(parseOffboardOptions({})).toEqual({ ok: false, problems: [{ option: 'slug', problem: 'required' }] })
    expect(parseOffboardOptions({ slug: 'ks orzeł' })).toEqual({
      ok: false,
      problems: [{ option: 'slug', problem: 'invalid' }],
    })
  })

  it('export-club: a slug and a .zip file', () => {
    expect(parseExportOptions({ slug: 'orlik', out: ' /tmp/orlik.ZIP ' })).toEqual({
      ok: true,
      options: { slug: 'orlik', out: '/tmp/orlik.ZIP' },
    })
    expect(parseExportOptions({ slug: 'orlik' })).toEqual({
      ok: false,
      problems: [{ option: 'out', problem: 'required' }],
    })
    expect(parseExportOptions({ slug: 'orlik', out: '/tmp/orlik.tar' })).toEqual({
      ok: false,
      problems: [{ option: 'out', problem: 'invalid' }],
    })
  })

  it('delete-club: the slug confirmed a second time', () => {
    expect(parseDeleteOptions({ slug: 'orlik', confirm: 'ORLIK', 'dry-run': true })).toEqual({
      ok: true,
      options: { slug: 'orlik', dryRun: true },
    })
    expect(parseDeleteOptions({ slug: 'orlik' })).toEqual({
      ok: false,
      problems: [{ option: 'confirm', problem: 'required' }],
    })
    expect(parseDeleteOptions({ slug: 'orlik', confirm: 'other' })).toEqual({
      ok: false,
      problems: [{ option: 'confirm', problem: 'mismatch' }],
    })
    expect(parseDeleteOptions({ confirm: 'orlik' })).toEqual({
      ok: false,
      problems: [{ option: 'slug', problem: 'required' }],
    })
  })

  it('restore-club: an archive', () => {
    expect(parseRestoreOptions({ in: ' /tmp/orlik.zip ' })).toEqual({
      ok: true,
      options: { archive: '/tmp/orlik.zip', dryRun: false },
    })
    expect(parseRestoreOptions({ in: true })).toEqual({ ok: false, problems: [{ option: 'in', problem: 'required' }] })
  })
})

describe('archive entries', () => {
  it('names a module file and an attachment file safe for every unzip', () => {
    expect(moduleEntryName('payments')).toBe('data/payments.json')
    expect(fileEntryName(FILE, 'Regulamin klubu (2026).pdf')).toBe(`files/${FILE}/Regulamin_klubu__2026_.pdf`)
    expect(fileEntryName(FILE, '..hidden')).toBe(`files/${FILE}/_hidden`)
    expect(fileEntryName(FILE, '')).toBe(`files/${FILE}/file`)
  })

  it('counts rows by module', () => {
    expect(
      countsByModule([
        { module: 'auth', rows: 2 },
        { module: 'people', rows: 5 },
        { module: 'auth', rows: 3 },
      ]),
    ).toEqual({ auth: 5, people: 5 })
  })
})

describe('parseManifest', () => {
  const valid = {
    format: CLUB_ARCHIVE_FORMAT,
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: '2026-11-23T10:00:00.000Z',
    club: { slug: 'orlik', tenantId: TENANT, organizationId: ORG },
    tables: [{ module: 'people', table: 'people_persons', key: 'tenant', rows: 1, decrypted: ['first_name'] }],
    files: [{ attachmentId: FILE, path: `files/${FILE}/a.pdf`, bytes: 3, sha256: SUM }],
    checksums: { 'data/people.json': SUM },
  }
  const parse = (value: unknown) => parseManifest(JSON.stringify(value))

  it('accepts a club export of this version', () => {
    expect(parse(valid)).toEqual(valid)
    const userOwned = { ...valid, tables: [{ ...valid.tables[0], table: 'user_consents', key: 'tenant_or_user' }] }
    expect(parse(userOwned)).toEqual(userOwned)
  })

  it('refuses anything else', () => {
    expect(parseManifest('{not json')).toBeNull()
    expect(parse([])).toBeNull()
    expect(parse({ ...valid, format: 'other' })).toBeNull()
    expect(parse({ ...valid, version: 2 })).toBeNull()
    expect(parse({ ...valid, club: null })).toBeNull()
    expect(parse({ ...valid, club: { ...valid.club, slug: 'Bad Slug' } })).toBeNull()
    expect(parse({ ...valid, club: { ...valid.club, tenantId: 'x' } })).toBeNull()
    expect(parse({ ...valid, club: { ...valid.club, organizationId: 7 } })).toBeNull()
    expect(parse({ ...valid, exportedAt: 'never' })).toBeNull()
    expect(parse({ ...valid, exportedAt: 7 })).toBeNull()
    expect(parse({ ...valid, tables: {} })).toBeNull()
    expect(parse({ ...valid, tables: [null] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], key: 'other' }] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], rows: -1 }] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], decrypted: [1] }] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], decrypted: 'x' }] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], module: 1 }] })).toBeNull()
    expect(parse({ ...valid, tables: [{ ...valid.tables[0], table: 1 }] })).toBeNull()
    expect(parse({ ...valid, files: null })).toBeNull()
    expect(parse({ ...valid, files: [null] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], attachmentId: 'x' }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], attachmentId: 1 }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], path: 'files/other/a.pdf' }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], path: 1 }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], bytes: 1.5 }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], sha256: 'short' }] })).toBeNull()
    expect(parse({ ...valid, files: [{ ...valid.files[0], sha256: 1 }] })).toBeNull()
    expect(parse({ ...valid, checksums: [] })).toBeNull()
    expect(parse({ ...valid, checksums: { 'data/people.json': 'short' } })).toBeNull()
    expect(parse({ ...valid, checksums: {} })).toBeNull()
  })
})

describe('parseRowJson', () => {
  it('keeps numbers that would lose digits as their source text', () => {
    expect(parseRowJson('{"n": 12, "f": 1.5, "lat": 52.22967561234567890, "big": 9007199254740993}')).toEqual({
      n: 12,
      f: 1.5,
      lat: '52.22967561234567890',
      big: '9007199254740993',
    })
  })

  it('refuses a row that is not an object', () => {
    expect(() => parseRowJson('[1]')).toThrow('not a JSON object')
  })
})

describe('redactExportRow', () => {
  it('clears the credentials of users and queued deliveries, and leaves other tables alone (*Data out*, #677)', () => {
    expect(CLUB_EXPORT_REDACTED_COLUMNS.users).toEqual(['password_hash'])
    expect(redactExportRow('users', { id: USER, email: 'a@example.org', password_hash: '$2b$x' })).toEqual({
      id: USER,
      email: 'a@example.org',
      password_hash: null,
    })
    expect(redactExportRow('foundation_deliveries', { id: FILE, secret_params: '{"token":"t"}' })).toEqual({
      id: FILE,
      secret_params: null,
    })
    // A redacted column the row does not have is not added.
    expect(redactExportRow('users', { id: USER })).toEqual({ id: USER })
    const person = { id: FILE, first_name: 'Zofia' }
    expect(redactExportRow('people_persons', person)).toBe(person)
  })
})

describe('archiveScopeViolations', () => {
  const tables = clubTables([{ module: 'people', tables: ['people_persons'] }])
  const manifestOf = (entries: { module: string; table: string; key: ClubTableKey }[]): ClubArchiveManifest => ({
    format: CLUB_ARCHIVE_FORMAT,
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: '2026-11-23T10:00:00.000Z',
    club: { slug: 'orlik', tenantId: TENANT, organizationId: ORG },
    tables: entries.map((entry) => ({ ...entry, rows: 1, decrypted: [] })),
    files: [],
    checksums: {},
  })
  const check = (
    entries: { module: string; table: string; key: ClubTableKey }[],
    rows: Record<string, Record<string, unknown>[]>,
  ) => archiveScopeViolations(manifestOf(entries), (table) => rows[table.table] ?? [], tables)

  it('accepts the club own tables and rows', () => {
    expect(
      check(
        [
          { module: 'directory', table: 'tenants', key: 'tenant_row' },
          { module: 'auth', table: 'users', key: 'tenant' },
          { module: 'auth', table: 'user_roles', key: 'user' },
          { module: 'people', table: 'people_persons', key: 'tenant' },
        ],
        {
          tenants: [{ id: TENANT }],
          users: [{ id: USER, tenant_id: TENANT }],
          user_roles: [{ id: FILE, user_id: USER }],
          people_persons: [{ id: FILE, tenant_id: TENANT }],
        },
      ),
    ).toEqual([])
  })

  it('names a table outside the export, under another module or key, and rows of another tenant or user', () => {
    expect(
      check(
        [
          { module: 'auth', table: 'sessions', key: 'user' },
          { module: 'auth', table: 'not_a_table', key: 'tenant' },
          { module: 'groups', table: 'people_persons', key: 'tenant' },
          { module: 'directory', table: 'organizations', key: 'user' },
          { module: 'directory', table: 'tenants', key: 'tenant_row' },
          { module: 'auth', table: 'user_roles', key: 'user' },
          { module: 'entities', table: 'encryption_maps', key: 'tenant' },
        ],
        {
          tenants: [{ id: OTHER_TENANT }],
          user_roles: [{ id: FILE, user_id: USER }],
          encryption_maps: [
            { id: FILE, tenant_id: OTHER_TENANT },
            { id: USER, tenant_id: OTHER_TENANT },
          ],
        },
      ),
    ).toEqual([
      'encryption_maps: a row of another tenant',
      'not_a_table: not a table of a club export',
      'organizations: not a table of a club export',
      'people_persons: not a table of a club export',
      'sessions: not a table of a club export',
      'tenants: a row of another tenant',
      'user_roles: a row of another tenant',
    ])
  })

  it('takes a user-owned row without a tenant when its user is the club own, also from an older archive (#681)', () => {
    const users = { module: 'auth', table: 'users', key: 'tenant' as const }
    expect(
      check(
        [
          users,
          { module: 'auth', table: 'user_consents', key: 'tenant_or_user' },
          { module: 'auth', table: 'sidebar_variants', key: 'tenant' },
        ],
        {
          users: [{ id: USER, tenant_id: TENANT }],
          user_consents: [
            { id: FILE, tenant_id: TENANT, user_id: USER },
            { id: USER, tenant_id: null, user_id: USER },
          ],
          sidebar_variants: [{ id: FILE, user_id: USER }],
        },
      ),
    ).toEqual([])
    expect(
      check([users, { module: 'auth', table: 'user_consents', key: 'tenant_or_user' }], {
        users: [{ id: USER, tenant_id: TENANT }],
        user_consents: [{ id: FILE, tenant_id: null, user_id: FILE }],
      }),
    ).toEqual(['user_consents: a row of another tenant'])
    expect(
      check([{ module: 'auth', table: 'user_consents', key: 'tenant_or_user' }], {
        user_consents: [{ id: FILE, tenant_id: OTHER_TENANT, user_id: USER }],
      }),
    ).toEqual(['user_consents: a row of another tenant'])
    expect(check([{ module: 'auth', table: 'user_consents', key: 'user' }], {})).toEqual([
      'user_consents: not a table of a club export',
    ])
  })
})

describe('archiveScopeViolations — references of the privilege-bearing tables (#806)', () => {
  const ROLE = '2a3b4c5d-6e7f-4801-9a2b-3c4d5e6f7a8b'
  const FOREIGN = '3b4c5d6e-7f80-4912-8b3c-4d5e6f7a8b9c'
  const tables = clubTables([])
  const manifestOf = (names: string[]): ClubArchiveManifest => ({
    format: CLUB_ARCHIVE_FORMAT,
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: '2026-11-26T10:00:00.000Z',
    club: { slug: 'orlik', tenantId: TENANT, organizationId: ORG },
    tables: names.map((table) => {
      const entry = PLATFORM_CLUB_TABLES.find((candidate) => candidate.table === table)
      if (!entry) throw new Error(`unknown table ${table}`)
      return { module: entry.module, table, key: entry.key, rows: 1, decrypted: [] }
    }),
    files: [],
    checksums: {},
  })
  const own = {
    organizations: [{ id: ORG, tenant_id: TENANT }],
    roles: [{ id: ROLE, tenant_id: TENANT }],
    users: [{ id: USER, tenant_id: TENANT, organization_id: ORG }],
  }
  const check = (rows: Record<string, Record<string, unknown>[]>) =>
    archiveScopeViolations(manifestOf(Object.keys(rows)), (table) => rows[table.table] ?? [], tables)

  it('accepts references to the archive own users, roles and organizations, and nulls', () => {
    expect(
      check({
        ...own,
        user_roles: [{ id: FILE, user_id: USER, role_id: ROLE }],
        role_acls: [{ id: FILE, tenant_id: TENANT, role_id: ROLE }],
        role_sidebar_preferences: [{ id: FILE, tenant_id: TENANT, role_id: ROLE }],
        user_acls: [{ id: FILE, tenant_id: TENANT, user_id: USER }],
        scheduled_jobs: [
          { id: FILE, tenant_id: TENANT, organization_id: ORG, scope_type: 'organization', created_by_user_id: null },
          { id: ROLE, tenant_id: TENANT, organization_id: null, scope_type: 'tenant', updated_by_user_id: USER },
        ],
        module_configs: [{ id: FILE, tenant_id: TENANT, organization_id: null }],
        encryption_maps: [{ id: FILE, tenant_id: TENANT, organization_id: ORG }],
        attachment_partitions: [{ id: FILE, tenant_id: TENANT }],
      }),
    ).toEqual([])
  })

  it('names a row whose user, role or organization is not the archive own, and a system schedule', () => {
    expect(
      check({
        ...own,
        users: [{ id: USER, tenant_id: TENANT, organization_id: FOREIGN }],
        user_roles: [{ id: FILE, user_id: USER, role_id: FOREIGN }],
        role_acls: [{ id: FILE, tenant_id: TENANT, role_id: FOREIGN }],
        role_sidebar_preferences: [{ id: FILE, tenant_id: TENANT, role_id: FOREIGN }],
        user_acls: [{ id: FILE, tenant_id: TENANT, user_id: FOREIGN }],
        module_configs: [{ id: FILE, tenant_id: TENANT, organization_id: FOREIGN }],
        encryption_maps: [{ id: FILE, tenant_id: TENANT, organization_id: FOREIGN }],
        attachment_partitions: [{ id: FILE, tenant_id: TENANT, organization_id: FOREIGN }],
      }),
    ).toEqual([
      'attachment_partitions: a reference outside the club',
      'encryption_maps: a reference outside the club',
      'module_configs: a reference outside the club',
      'role_acls: a reference outside the club',
      'role_sidebar_preferences: a reference outside the club',
      'user_acls: a reference outside the club',
      'user_roles: a reference outside the club',
      'users: a reference outside the club',
    ])
    const schedule = { id: FILE, tenant_id: TENANT, organization_id: ORG, scope_type: 'organization' }
    for (const forged of [
      { ...schedule, scope_type: 'system' },
      { ...schedule, scope_type: undefined },
      { ...schedule, organization_id: FOREIGN },
      { ...schedule, created_by_user_id: FOREIGN },
      { ...schedule, updated_by_user_id: FOREIGN },
    ]) {
      expect(check({ ...own, scheduled_jobs: [forged] })).toEqual(['scheduled_jobs: a reference outside the club'])
    }
  })

  it('checks the references against an empty set when the archive has no users, roles or organizations', () => {
    expect(check({ user_acls: [{ id: FILE, tenant_id: TENANT, user_id: USER }] })).toEqual([
      'user_acls: a reference outside the club',
    ])
  })
})

describe('isTenantRestrictedFeature', () => {
  it('flags the global wildcard and tenant management only', () => {
    expect(
      ['*', 'directory.*', 'directory.tenants.*', 'directory.tenants.manage'].map(isTenantRestrictedFeature),
    ).toEqual([true, true, true, true])
    expect(['auth.*', 'directory.organizations.manage', 'people.persons.view'].map(isTenantRestrictedFeature)).toEqual([
      false,
      false,
      false,
    ])
  })
})

describe('sanitizeRestoreRow (#806)', () => {
  const OTHER_ORG = '4c5d6e7f-8091-4a23-9c4d-5e6f7a8b9c0d'
  const orgs = new Set<unknown>([ORG])

  it('drops the super-admin flag, tenant-restricted features and foreign organizations of an ACL row', () => {
    for (const table of ['role_acls', 'user_acls']) {
      const row = {
        id: FILE,
        tenant_id: TENANT,
        is_super_admin: true,
        features_json: ['*', 'directory.tenants.manage', 'auth.*', 7, 'people.persons.view'],
        organizations_json: [ORG, OTHER_ORG, '__all__', null],
      }
      expect(sanitizeRestoreRow(table, row, orgs)).toEqual({
        id: FILE,
        tenant_id: TENANT,
        is_super_admin: false,
        features_json: ['auth.*', 'people.persons.view'],
        organizations_json: [ORG, '__all__'],
      })
      // The archive row itself is not changed.
      expect(row.is_super_admin).toBe(true)
    }
  })

  it('turns a malformed feature or organization list into null and adds no column the row lacks', () => {
    expect(
      sanitizeRestoreRow('role_acls', { id: FILE, features_json: '["*"]', organizations_json: { a: ORG } }, orgs),
    ).toEqual({ id: FILE, features_json: null, organizations_json: null })
    expect(sanitizeRestoreRow('user_acls', { id: FILE }, orgs)).toEqual({ id: FILE })
  })

  it('keeps the redacted export columns null and leaves other tables as they are', () => {
    expect(sanitizeRestoreRow('users', { id: USER, password_hash: '$2b$forged' }, orgs)).toEqual({
      id: USER,
      password_hash: null,
    })
    const person = { id: FILE, is_super_admin: true }
    expect(sanitizeRestoreRow('people_persons', person, orgs)).toBe(person)
  })
})

describe('encryptedRowKeys', () => {
  it('maps each encryption-map field to the key the row has, in any spelling, sorted and once (#681)', () => {
    const row = { id: FILE, first_name: 'x', last_name: 'y', notes: 'z', ipAddress: '1' }
    expect(encryptedRowKeys(['notes', 'firstName', 'last_name', 'ip_address', 'first_name', 'missing'], row)).toEqual([
      'first_name',
      'ipAddress',
      'last_name',
      'notes',
    ])
    expect(encryptedRowKeys([], row)).toEqual([])
  })
})

describe('safeAttachmentLocation', () => {
  it('accepts a plain partition code and a relative path inside it', () => {
    expect(safeAttachmentLocation('privateAttachments', 'org_1/2026/a.png')).toBe(true)
    expect(safeAttachmentLocation('public-2', 'a..b/c.png')).toBe(true)
  })

  it('refuses a missing or unusual code, and an empty, absolute, parent or NUL path', () => {
    expect(safeAttachmentLocation(null, 'a.png')).toBe(false)
    expect(safeAttachmentLocation('../root', 'a.png')).toBe(false)
    expect(safeAttachmentLocation('public', 7)).toBe(false)
    expect(safeAttachmentLocation('public', '')).toBe(false)
    expect(safeAttachmentLocation('public', 'a\0.png')).toBe(false)
    expect(safeAttachmentLocation('public', '/etc/passwd')).toBe(false)
    expect(safeAttachmentLocation('public', '\\server\\share')).toBe(false)
    expect(safeAttachmentLocation('public', 'C:/x.png')).toBe(false)
    expect(safeAttachmentLocation('public', 'a/../../x.png')).toBe(false)
    expect(safeAttachmentLocation('public', 'a\\..\\x.png')).toBe(false)
  })
})
