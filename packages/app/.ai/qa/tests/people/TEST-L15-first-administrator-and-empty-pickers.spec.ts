import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken, signInBrowserContext } from '../_fixtures/auth'
import {
  createUserFixture,
  deleteUserIfExists,
  setRoleAclFeatures,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { birthDateTurning, call, createClub, createPerson, mercato, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { createIsolatedTenant, type IsolatedTenant } from '../_fixtures/tenant'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L3 (#305; REQ-L13, REQ-L14, J-L08): TEST-L15 — on a tenant whose only user is a
// technical administrator, the banner leads to the first-administrator page, which makes another user of the
// organization the club administrator (a second call answers 409 `club_admin_exists`); that administrator then adds
// a place with an institution created in place, a guardian created in place from the search, a section and a group
// without the command line. TEST-L14 — a coordinator meets "Ask the club administrator" and no button where they may
// not create (the external team's institution, the team's age category), and an in-place season. TEST-L20 — the two
// new routes fail closed.
test.describe.configure({ timeout: 300_000 })

type FreshTenant = {
  tenant: IsolatedTenant
  superToken: string
  /** The technical administrator: the tenant's user, with `auth.users.create` through its platform role. */
  techToken: string
  /** A user of the organization without any feature: the future club administrator. */
  future: { userId: string; email: string; password: string }
  cleanup: () => Promise<void>
}

async function freshTenant(request: APIRequestContext, label: string): Promise<FreshTenant> {
  const tenant = await createIsolatedTenant(request, label)
  const superToken = await getAuthToken(request, 'superadmin')
  const extraUsers: string[] = []
  const cleanup = async () => {
    for (const userId of extraUsers) await deleteUserIfExists(request, superToken, userId)
    await tenant.cleanup()
  }
  try {
    await setRoleAclFeatures(request, superToken, {
      roleId: tenant.roleId,
      features: ['auth.users.create', 'auth.users.list', 'auth.roles.list', 'directory.organizations.view'],
    })
    mercato(['entities', 'seed-encryption', '--tenant', tenant.tenantId])
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const email = `joanna-${uniqueSuffix()}@example.org`
    const userId = await createUserFixture(request, superToken, {
      email,
      password,
      organizationId: tenant.organizationId,
      roles: [],
      name: 'Joanna Nowak',
    })
    extraUsers.push(userId)
    const techToken = await getAuthToken(request, tenant.email, tenant.password)
    return { tenant, superToken, techToken, future: { userId, email, password }, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

type FirstAdministratorAnswer = {
  administrator?: { personId: string; name: string } | string | null
  personId?: string
  code?: string
}

/** `GET` (no `data`) or `POST` `/api/people/first-administrator`. */
function firstAdministrator(request: APIRequestContext, token: string, data?: Record<string, unknown>) {
  return call<FirstAdministratorAnswer>(request, data ? 'POST' : 'GET', '/api/people/first-administrator', token, {
    ...(data ? { data } : {}),
  })
}

async function login(page: Page, email: string, password: string) {
  await signInBrowserContext(page.request, email, password)
}

test('TEST-L20 the first-administrator and institution-options routes fail closed', async ({ request }) => {
  const fresh = await freshTenant(request, 'l20-first-admin')
  const club = await createClub(request, 'l20-other-club')
  try {
    // A user without `auth.users.create` (the future administrator, no feature yet) reads and writes nothing.
    const futureToken = await getAuthToken(request, fresh.future.email, fresh.future.password)
    expect((await firstAdministrator(request, futureToken)).status).toBe(403)
    expect(
      (await firstAdministrator(request, futureToken, { userId: fresh.future.userId, firstName: 'A', lastName: 'B' }))
        .status,
    ).toBe(403)
    // A user of another tenant is not a user of this organization: 404, nothing created.
    const outside = await firstAdministrator(request, fresh.techToken, {
      userId: club.adminUserId,
      firstName: 'Ada',
      lastName: 'Obca',
    })
    expect(outside.status, JSON.stringify(outside.body)).toBe(404)
    expect(outside.body?.code).toBe('user_not_in_organization')
    expect((await firstAdministrator(request, fresh.techToken)).body?.administrator).toBeNull()
    // Unknown fields are refused.
    expect(
      (
        await firstAdministrator(request, fresh.techToken, {
          userId: fresh.future.userId,
          firstName: 'A',
          lastName: 'B',
          validFrom: '2020-01-01',
        })
      ).status,
    ).toBe(400)

    // The institution options: names only, of the caller's club only; refused without a club grant.
    const institutionId = await create(request, club.adminToken, 'institutions', {
      name: 'Gmina L20',
      type: 'municipality',
      bankAccount: '61109010140000071219812874',
      notes: 'poufne',
    })
    const options = await call<{ items?: Array<Record<string, unknown>> }>(
      request,
      'GET',
      '/api/club_core/institutions/options',
      club.adminToken,
    )
    expect(options.status).toBe(200)
    // `next.config.ts` sets `private, no-store` on every authenticated API response (S8.4, #463).
    expect(options.response.headers()['cache-control']).toMatch(/\bno-store\b/)
    expect(options.body?.items).toEqual([{ id: institutionId, name: 'Gmina L20' }])
    const searched = await call<{ items?: unknown[] }>(
      request,
      'GET',
      '/api/club_core/institutions/options?search=nothing-like-it',
      club.adminToken,
    )
    expect(searched.body?.items).toEqual([])
    const unlinked = await call(request, 'GET', '/api/club_core/institutions/options', fresh.techToken)
    expect([401, 403]).toContain(unlinked.status)
  } finally {
    await club.cleanup()
    await fresh.cleanup()
  }
})

test('TEST-L15 a new club is set up in the panel: first administrator, place with institution, guardian, section, group', async ({
  page,
  request,
}) => {
  const fresh = await freshTenant(request, 'l15-first-admin')
  try {
    // J-L08 step 1: the banner and the page, as the technical administrator.
    await login(page, fresh.tenant.email, fresh.tenant.password)
    // Any backend page carries the banner; the platform Users page is one the technical administrator may open.
    await page.goto('/backend/users')
    const banner = page.getByTestId('people-first-administrator-banner')
    await expect(banner).toBeVisible()
    await banner.getByRole('link', { name: uiText('people.firstAdministrator.banner.action', { exact: true }) }).click()
    await expect(page).toHaveURL(/\/backend\/people\/first-administrator$/)
    await page.getByTestId('people-first-administrator-user').getByRole('combobox').fill(fresh.future.email)
    await page.getByRole('option', { name: new RegExp(fresh.future.email.replace(/[.+]/g, '\\$&')) }).click()
    await page.locator('[data-crud-field-id="firstName"] input').fill('Joanna')
    await page.locator('[data-crud-field-id="lastName"] input').fill('Nowak')
    await page
      .getByRole('button', { name: uiText('people.firstAdministrator.submit', { exact: true }) })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/people\/persons$/)

    // The club has its administrator; a second call answers 409 naming her, and the page says who it is.
    const status = await firstAdministrator(request, fresh.techToken)
    expect(status.body?.administrator).toMatchObject({ name: 'Joanna Nowak' })
    const again = await firstAdministrator(request, fresh.techToken, {
      userId: fresh.tenant.userId,
      firstName: 'Drugi',
      lastName: 'Admin',
    })
    expect(again.status).toBe(409)
    expect(again.body?.code).toBe('club_admin_exists')
    expect(again.body?.administrator).toBe('Joanna Nowak')
    await page.goto('/backend/people/first-administrator')
    await expect(page.getByTestId('people-first-administrator-exists')).toContainText('Joanna Nowak')
    await page.goto('/backend/users')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByTestId('people-first-administrator-banner')).toHaveCount(0)

    // J-L08 step 2, as the new club administrator: a place whose owner is created in place and selected.
    await signOutBrowser(page)
    await login(page, fresh.future.email, fresh.future.password)
    const adminToken = await getAuthToken(request, fresh.future.email, fresh.future.password)
    await page.goto('/backend/club/places/create')
    await page.locator('[data-crud-field-id="name"] input').fill('Boisko L15')
    const ownerHint = page.getByTestId('picker-ownerInstitutionId-hint')
    await expect(ownerHint).toContainText(uiText('club_core.picker.institution.none'))
    await ownerHint.getByRole('button', { name: uiText('club_core.picker.institution.add', { exact: true }) }).click()
    const dialog = page.getByTestId('picker-ownerInstitutionId-create')
    await dialog.getByLabel(uiText('club_core.institutions.fields.name', { exact: true })).fill('Gmina Miasto L15')
    await dialog.getByLabel(uiText('club_core.institutions.fields.type', { exact: true })).selectOption('municipality')
    await dialog.getByTestId('picker-ownerInstitutionId-create-submit').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-crud-field-id="ownerInstitutionId"] select option:checked')).toHaveText(
      'Gmina Miasto L15',
    )
    await expect(page.locator('[data-crud-field-id="ownerInstitutionId"] select')).toBeFocused()
    await page
      .getByRole('button', { name: uiText('club_core.common.create', { exact: true }) })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/club\/places(\?.*)?$/)
    const places = await call<{ items?: Array<{ name: string; ownerInstitutionId: string | null }> }>(
      request,
      'GET',
      '/api/club_core/places?pageSize=10',
      adminToken,
    )
    const institutions = await call<{ items?: Array<{ id: string; name: string }> }>(
      request,
      'GET',
      '/api/club_core/institutions/options',
      adminToken,
    )
    const institution = institutions.body?.items?.find((item) => item.name === 'Gmina Miasto L15')
    expect(institution).toBeDefined()
    expect(places.body?.items?.find((item) => item.name === 'Boisko L15')?.ownerInstitutionId).toBe(institution?.id)

    // J-L08 step 3: a child, and the mother created in place from a search that found nobody.
    const childId = await createPerson(request, adminToken, {
      firstName: 'Zosia',
      lastName: 'Kowalska',
      birthDate: birthDateTurning(8),
    })
    await page.goto(`/backend/people/persons/${childId}`)
    await page.getByRole('tab', { name: uiText('people.persons.tabs.guardianship', { exact: true }) }).click()
    await page.getByRole('button', { name: uiText('people.guardianships.add.guardian', { exact: true }) }).click()
    await page.getByPlaceholder(uiText('people.guardianships.fields.person.search')).fill('Kasia Kowalska')
    const personHint = page.getByTestId('people-guardianship-person-hint')
    await expect(personHint).toContainText(uiText('people.picker.person.noMatch'))
    await personHint.getByTestId('people-guardianship-person-hint-create').click()
    const personDialog = page.getByTestId('people-guardianship-person-create')
    await expect(personDialog.getByLabel(uiText('people.persons.fields.firstName', { exact: true }))).toHaveValue(
      'Kasia',
    )
    await expect(personDialog.getByLabel(uiText('people.persons.fields.lastName', { exact: true }))).toHaveValue(
      'Kowalska',
    )
    await personDialog.getByTestId('people-guardianship-person-create-submit').click()
    await expect(personDialog).toHaveCount(0)
    await page.getByRole('button', { name: uiText('people.guardianships.actions.add', { exact: true }) }).click()
    await expect
      .poll(async () => {
        const result = await call<{ items?: Array<{ guardianPersonId: string; wardPersonId: string }> }>(
          request,
          'GET',
          `/api/people/guardianships?personId=${childId}`,
          adminToken,
        )
        return result.body?.items?.length ?? 0
      })
      .toBe(1)

    // J-L08 steps 4–5: the group form without sections links to the section page; with one, the group is created.
    await page.goto('/backend/groups/groups/create')
    const sectionHint = page.getByTestId('picker-sectionId-hint')
    await expect(sectionHint).toContainText(uiText('groups.picker.section.none'))
    await expect(sectionHint.getByTestId('picker-sectionId-hint-link')).toHaveAttribute(
      'href',
      '/backend/club/sections/create',
    )
    await create(request, adminToken, 'sections', { name: 'Akademia L15' })
    // The window regains focus after the other tab: the select loads again and offers the new section.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.locator('[data-crud-field-id="name"] input').fill('Kids 2021')
    await expect(async () => {
      await page
        .locator('[data-crud-field-id="sectionId"] select')
        .selectOption({ label: 'Akademia L15' }, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page
      .getByRole('button', { name: uiText('groups.common.create', { exact: true }) })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/groups\/groups\/[0-9a-f-]{36}$/)
  } finally {
    await fresh.cleanup()
  }
})

test('TEST-L14 a coordinator is told to ask the club administrator and gets no button; a season is created in place', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'l14-coordinator')
  try {
    const sectionId = await create(request, club.adminToken, 'sections', { name: 'Akademia L14' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kora',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId,
    })
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)

    // External team (row 6): the institution list is readable, empty here, and adding one is the administrator's.
    await page.goto('/backend/groups/external-teams/create')
    const institutionHint = page.getByTestId('picker-institutionId-hint')
    await expect(institutionHint).toContainText(uiText('groups.picker.institution.none'))
    await expect(institutionHint).toContainText(uiText('groups.picker.askAdmin'))
    await expect(institutionHint.locator('button, a')).toHaveCount(0)

    // Group form (row 5): no age category and no `dictionaries.manage` → ask the administrator, no button; the
    // season is the coordinator's and is created in place and selected.
    await page.goto('/backend/groups/groups/create')
    const categoryHint = page.getByTestId('picker-ageCategoryEntryId-hint')
    await expect(categoryHint).toContainText(uiText('groups.picker.ageCategory.none'))
    await expect(categoryHint).toContainText(uiText('groups.picker.askAdmin'))
    await expect(categoryHint.locator('button, a')).toHaveCount(0)
    const seasonHint = page.getByTestId('picker-seasonId-hint')
    await seasonHint.getByTestId('picker-seasonId-hint-create').click()
    const seasonDialog = page.getByTestId('picker-seasonId-create')
    await seasonDialog.getByLabel(uiText('groups.seasons.fields.name', { exact: true })).fill('2026/27 L14')
    await seasonDialog.getByLabel(uiText('groups.seasons.fields.startsOn', { exact: true })).fill('2026-09-01')
    await seasonDialog.getByLabel(uiText('groups.seasons.fields.endsOn', { exact: true })).fill('2027-06-30')
    await seasonDialog.getByTestId('picker-seasonId-create-submit').click()
    await expect(seasonDialog).toHaveCount(0)
    await expect(page.locator('[data-crud-field-id="seasonId"] select option:checked')).toHaveText('2026/27 L14')
    // The coordinator's own section is offered; no section hint.
    await expect(
      page.locator('[data-crud-field-id="sectionId"] select option', { hasText: 'Akademia L14' }),
    ).toHaveCount(1)
    await expect(page.getByTestId('picker-sectionId-hint')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
