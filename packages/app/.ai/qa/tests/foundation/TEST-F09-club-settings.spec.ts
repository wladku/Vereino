import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  call,
  createAccount,
  createClub,
  createPerson,
  uniqueSuffix,
} from '../_fixtures/club'

// TEST-F09 (foundation spec DD-F16; club spec DD-37): club settings read their typed defaults when unset, refuse an
// invalid write, keep a valid one, and fall back to the default (named in `defaultsApplied`, reported as
// `club_core.settings.invalid`) when the stored value is invalid; `people` reads the threshold through the service.
test.describe.configure({ timeout: 300_000 })

type Settings = {
  ownAccountMinAge?: number
  defaultLocale?: string
  timezone?: string
  defaultsApplied?: string[]
  updatedAt?: string | null
  code?: string
}

test('TEST-F09 club settings: defaults, validation, stored values and invalid stored value', async ({ request }) => {
  const club = await createClub(request, 'test-f09')
  try {
    const read = () => call<Settings>(request, 'GET', '/api/club_core/settings', club.adminToken)

    const defaults = await read()
    expect(defaults.status).toBe(200)
    expect(defaults.body).toMatchObject({
      ownAccountMinAge: 16,
      defaultLocale: 'pl',
      timezone: 'Europe/Warsaw',
      defaultsApplied: [],
      updatedAt: null,
    })

    const invalid = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { ownAccountMinAge: 0 },
    })
    expect(invalid.status).toBe(400)
    const unknownKey = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { organizationId: club.tenant.organizationId },
    })
    expect(unknownKey.status).toBe(400)

    const written = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { ownAccountMinAge: 14, timezone: 'Europe/Berlin' },
    })
    expect(written.status, JSON.stringify(written.body)).toBe(200)
    const stored = await read()
    expect(stored.body).toMatchObject({ ownAccountMinAge: 14, timezone: 'Europe/Berlin', defaultLocale: 'pl' })
    const stale = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { ownAccountMinAge: 15 },
      headers: { [OPTIMISTIC_LOCK_HEADER]: '2000-01-01T00:00:00.000Z' },
    })
    expect(stale.status).toBe(409)

    // The people command reads the threshold through club_core: a 15-year-old may now have an account.
    const teenId = await createPerson(request, club.adminToken, {
      firstName: 'Tosia',
      lastName: 'Nastolatka',
      birthDate: birthDateTurning(15),
    })
    const teen = await createAccount(request, club.adminToken, teenId, `tosia-${uniqueSuffix()}@example.org`)
    expect(teen.status, JSON.stringify(teen.body)).toBe(201)
    club.extraUserIds.push(String(teen.body?.userId))

    // An invalid stored value (written past the API) reads as its default and is named.
    await withClient(async (client) => {
      await client.query('update club_core_club_settings set own_account_min_age = 99 where organization_id = $1', [
        club.tenant.organizationId,
      ])
    })
    const fallback = await read()
    expect(fallback.body).toMatchObject({ ownAccountMinAge: 16, defaultsApplied: ['ownAccountMinAge'] })
    const otherTeenId = await createPerson(request, club.adminToken, {
      firstName: 'Tadek',
      lastName: 'Nastolatek',
      birthDate: birthDateTurning(15),
    })
    const refused = await createAccount(request, club.adminToken, otherTeenId, `tadek-${uniqueSuffix()}@example.org`)
    expect(refused.status).toBe(422)
    expect(refused.body?.code).toBe('account_age_below_threshold')
  } finally {
    await club.cleanup()
  }
})
