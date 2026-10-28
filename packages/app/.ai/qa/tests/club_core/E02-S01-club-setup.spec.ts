import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { OPTIMISTIC_LOCK_HEADER, birthDateTurning, call, createClub, createStaff } from '../_fixtures/club'
import { checkBookablePlace, create, getOne, list, signInBrowser, update } from '../_fixtures/club-structure'

// Issue #25 (E02-S01) acceptance criteria: the DD-37 defaults on a fresh tenant, each editable; the leaf rule for
// a complex with children; two clubs on two tenants do not see each other's sections; a user without the
// `club_core` features gets "Access denied" and no club data.
test.describe.configure({ timeout: 300_000 })

type Settings = Record<string, unknown> & { updatedAt?: string | null }

test('E02-S01 a fresh tenant reads the club defaults, and each one is editable', async ({ request }) => {
  const club = await createClub(request, 'e02-s01-defaults')
  try {
    const read = () => call<Settings>(request, 'GET', '/api/club_core/settings', club.adminToken)
    const defaults = await read()
    expect(defaults.status).toBe(200)
    expect(defaults.body).toMatchObject({
      ownAccountMinAge: 16,
      shortName: null,
      currency: 'PLN',
      declarationKinds: {
        training: 'absence_only',
        match: 'confirm',
        sparring: 'confirm',
        tournament: 'confirm',
        camp: 'confirm',
        other: 'confirm',
      },
      onlineFeeMode: 'club_pays',
      onlineFeePercent: 0,
      onlineFeeFixed: 0,
      coachSettlementModel: 'units_per_contract',
      showCalledUpChildren: 'none',
      orderSalesDocument: 'none',
      updatedAt: null,
    })

    const edits: Settings[] = [
      { ownAccountMinAge: 13 },
      { declarationKinds: { training: 'confirm', match: 'absence_only' } },
      { onlineFeeMode: 'payer_pays', onlineFeePercent: 1.5, onlineFeeFixed: 100 },
      { coachSettlementModel: 'fixed_base_adjusted' },
      { showCalledUpChildren: 'consented' },
      { orderSalesDocument: 'none' },
    ]
    for (const data of edits) {
      const current = await read()
      const saved = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
        data,
        headers: current.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.body.updatedAt } : {},
      })
      expect(saved.status, `${JSON.stringify(data)} ${JSON.stringify(saved.body)}`).toBe(200)
      expect(saved.body).toMatchObject(data)
    }
    expect((await read()).body).toMatchObject({
      ownAccountMinAge: 13,
      declarationKinds: { training: 'confirm', match: 'absence_only', tournament: 'confirm' },
      onlineFeeMode: 'payer_pays',
      coachSettlementModel: 'fixed_base_adjusted',
      showCalledUpChildren: 'consented',
    })
  } finally {
    await club.cleanup()
  }
})

test('E02-S01 a session or booking pointed at a complex with children is refused (places are leaves)', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s01-leaf')
  try {
    const orlik = await create(request, club.adminToken, 'places', { name: 'Orlik 2024', kind: 'complex' })
    // A complex without children is still a leaf.
    expect(checkBookablePlace(club, orlik)).toEqual({ bookable: true })
    const children = []
    for (const [name, kind] of [
      ['Boisko piłkarskie', 'pitch'],
      ['Hala', 'hall'],
      ['Basen zewnętrzny', 'pool'],
    ] as const) {
      children.push(await create(request, club.adminToken, 'places', { name, kind, parentPlaceId: orlik }))
    }
    expect(checkBookablePlace(club, orlik)).toEqual({ bookable: false, status: 422, code: 'place_not_bookable' })
    for (const child of children) expect(checkBookablePlace(club, child)).toEqual({ bookable: true })
    // An unknown place (or one of another club) is not found.
    const other = await createClub(request, 'e02-s01-leaf-other')
    try {
      const foreign = await create(request, other.adminToken, 'places', { name: 'Hala obca', kind: 'hall' })
      expect(checkBookablePlace(club, foreign)).toMatchObject({ bookable: false, status: 404 })
    } finally {
      await other.cleanup()
    }
  } finally {
    await club.cleanup()
  }
})

test('E02-S01 two clubs on two tenants: the first administrator lists none of the second club’s sections', async ({
  request,
}) => {
  const first = await createClub(request, 'e02-s01-first')
  const second = await createClub(request, 'e02-s01-second')
  try {
    const own = await create(request, first.adminToken, 'sections', { name: 'Akademia piłkarska' })
    const foreign = await create(request, second.adminToken, 'sections', { name: 'Basen' })
    const firstList = await list(request, first.adminToken, 'sections')
    expect(firstList.status).toBe(200)
    expect(firstList.items.map((item) => item.id)).toEqual([own])
    expect(await getOne(request, first.adminToken, 'sections', foreign)).toBeUndefined()

    // A write to the other club's section by id finds nothing (404), and the section is unchanged.
    const ownRow = await getOne(request, first.adminToken, 'sections', own)
    const write = await update(
      request,
      first.adminToken,
      'sections',
      { id: foreign, name: 'Przejęta' },
      ownRow?.updatedAt,
    )
    expect(write.status).toBe(404)
    expect((await getOne(request, second.adminToken, 'sections', foreign))?.name).toBe('Basen')
  } finally {
    await second.cleanup()
    await first.cleanup()
  }
})

test('E02-S01 a user without club_core.manage gets "Access denied" and no club data', async ({ page, request }) => {
  const club = await createClub(request, 'e02-s01-denied')
  try {
    const marker = `Klub Testowy ${Date.now().toString(36)}`
    const saved = await call(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { shortName: marker },
    })
    expect(saved.status).toBe(200)
    await create(request, club.adminToken, 'sections', { name: `${marker} — sekcja` })

    // A member: an account with `vereino_member` only (no club_core feature).
    const member = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Opiekunka',
      birthDate: birthDateTurning(38),
    })
    const password = await signInBrowser(page, request, club, member.userId, member.email)
    const memberToken = await getAuthToken(request, member.email, password)

    // API: every club_core read and write is refused.
    for (const [method, url] of [
      ['GET', '/api/club_core/settings'],
      ['PUT', '/api/club_core/settings'],
      ['GET', '/api/club_core/sections'],
      ['GET', '/api/club_core/places'],
      ['GET', '/api/club_core/institutions'],
    ] as const) {
      const response = await call(request, method, url, memberToken, {
        data: method === 'PUT' ? { shortName: 'X' } : undefined,
      })
      expect(response.status, `${method} ${url}`).toBe(403)
      expect(JSON.stringify(response.body)).not.toContain(marker)
    }

    // UI: the settings page renders the platform's permission-denied state without club data.
    await page.goto('/backend/club/settings')
    await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
    await page.goto('/backend/club/sections')
    await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
