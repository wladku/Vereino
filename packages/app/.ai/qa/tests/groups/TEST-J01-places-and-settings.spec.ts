import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import {
  addMembership,
  ageCategoryOptions,
  createGroup,
  createSeason,
  getGroup,
  listGroups,
  roster,
  seedAgeCategories,
  signedInStaff,
  updateGroup,
} from '../_fixtures/groups'
import { getSection, putSectionPublic } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-J01 (section sign-up form spec phase 1, E26-S02 #798; REQ-J01, REQ-J02, AC-J01): a group gets a limit of places
// and "Accepts applications" (API and the group's "Public page" tab); the roster shows "x / limit" on the group page,
// the groups list and the coordinator's phone page, also above the limit, because a manual add is never blocked
// (DD-J10a); a limit outside 1–500 is refused. The section's "accepts online applications" switch is stored through
// the section's public route (its form field stays hidden until phase 3). The club administrator sets the age
// reference day, the answer time and the information for applicants on `/backend/club/settings`; a day the month lacks,
// an answer time outside 1–60 and a text over 6000 characters are refused, and an empty text restores the built-in
// one. The fit rule moved to `@vereino/core` (DD-J04) gives the same "Fits" result on the bulk move: a Żak team U8–U9
// in season 2026/27 fits the birth years 2018–2019. The "Apply" button check of TEST-J01 closes in phase 2.
// Pages at 375 px in en and pl, light and dark, axe clean, no sideways scroll.
test.describe.configure({ timeout: 600_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

type Settings = {
  applicationAgeReferenceDay?: string
  applicationAnswerDays?: number
  applicationInformation?: string | null
  updatedAt?: string | null
  code?: string
  fieldErrors?: Record<string, string>
}
type GroupDetail = {
  placesLimit?: number | null
  acceptsApplications?: boolean
  participantCount?: number
  updatedAt?: string | null
}
type MoveBody = {
  items?: { personId: string; fitsTarget: boolean | null }[]
  fitRule?: Record<string, unknown> | null
}

async function readSettings(request: APIRequestContext, token: string) {
  return call<Settings>(request, 'GET', '/api/club_core/settings', token)
}

async function putSettings(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const current = await readSettings(request, token)
  return call<Settings>(request, 'PUT', '/api/club_core/settings', token, {
    data,
    headers: current.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.body.updatedAt } : {},
  })
}

async function groupDetail(request: APIRequestContext, token: string, id: string): Promise<GroupDetail> {
  const result = await getGroup(request, token, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as GroupDetail
}

function placesText(places: string) {
  return uiText('groups.groups.places', { params: { places }, exact: true })
}

test('TEST-J01 group places and the switches, the application settings, "x / limit" on the roster and the moved fit rule', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-j01-places-settings')
  try {
    let admin = club.adminToken
    const today = calendarDate()
    seedAgeCategories(club)
    const zak = (await ageCategoryOptions(request, admin)).items.find((item) => item.value === 'zak')
    expect(zak, 'the seeded Żak category').toBeTruthy()
    const season = await createSeason(request, admin, { name: '2026/27', startsOn: '2026-09-01', endsOn: '2027-08-31' })
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia J01' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const zaki = await createGroup(request, admin, {
      sectionId: academy,
      name: 'Żaki 2026/27',
      kind: 'team',
      ageCategoryEntryId: zak?.id,
      seasonId: season,
      isPublic: true,
    })
    const recruits = await createGroup(request, admin, { sectionId: academy, name: 'Nabór J01', kind: 'class_group' })

    // --- A new group has no limit and accepts applications; a limit outside 1–500 is refused ---
    const fresh = await groupDetail(request, admin, recruits)
    expect(fresh).toMatchObject({ placesLimit: null, acceptsApplications: true, participantCount: 0 })
    for (const placesLimit of [0, 501, 2.5]) {
      const refused = await updateGroup(request, admin, { id: recruits, placesLimit }, fresh.updatedAt)
      expect(refused.status, `placesLimit ${String(placesLimit)}: ${JSON.stringify(refused.body)}`).toBe(400)
    }

    // --- The coordinator of the section sets a limit of 2 and turns applications off ---
    const limited = await updateGroup(
      request,
      coordinator.token,
      { id: recruits, placesLimit: 2, acceptsApplications: false },
      fresh.updatedAt,
    )
    expect(limited.status, JSON.stringify(limited.body)).toBe(200)
    expect(await groupDetail(request, admin, recruits)).toMatchObject({ placesLimit: 2, acceptsApplications: false })

    // --- Three participants (one above the limit: a manual add is never blocked) and a coach, who takes no place ---
    const born = async (firstName: string, birthDate: string) => {
      const personId = await createPerson(request, admin, { firstName, lastName: 'Rocznik', birthDate })
      await addMembership(request, admin, { groupId: recruits, personId, role: 'participant', validFrom: today })
      return personId
    }
    // Born at the very end of 2018 and in mid-2019 (Żak U8–U9 in 2026: 2018–2019), and one day before 2018.
    const late2018 = await born('Lena', '2018-12-31')
    const mid2019 = await born('Igor', '2019-06-01')
    const late2017 = await born('Maks', '2017-12-31')
    const coach = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Trener',
      birthDate: birthDateTurning(30),
    })
    await addMembership(request, admin, { groupId: recruits, personId: coach, role: 'coach', validFrom: today })
    expect(await groupDetail(request, admin, recruits)).toMatchObject({ participantCount: 3, placesLimit: 2 })
    const listed = await listGroups(request, admin, `&sectionId=${academy}`)
    expect(listed.items.find((group) => group.id === recruits)).toMatchObject({
      participantCount: 3,
      placesLimit: 2,
      acceptsApplications: false,
    })
    expect(listed.items.find((group) => group.id === zaki)).toMatchObject({
      placesLimit: null,
      acceptsApplications: true,
    })

    // --- The moved fit rule (`@vereino/core`, DD-J04) gives the same "Fits" result on the bulk move ---
    const recruitRows = (await roster(request, admin, recruits)).items
    const membershipIds = [late2018, mid2019, late2017].map((personId) =>
      String(recruitRows.find((row) => row.personId === personId && row.role === 'participant')?.id),
    )
    const preview = await call<MoveBody>(request, 'POST', '/api/groups/memberships/move-many', coordinator.token, {
      data: { fromGroupId: recruits, toGroupId: zaki, date: today, membershipIds, dryRun: true },
    })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body?.fitRule).toEqual({
      kind: 'birth_years',
      uFrom: 8,
      uTo: 9,
      referenceYear: 2026,
      from: 2018,
      to: 2019,
    })
    const fits = new Map((preview.body?.items ?? []).map((item) => [item.personId, item.fitsTarget]))
    expect([late2018, mid2019, late2017].map((personId) => fits.get(personId))).toEqual([true, true, false])

    // --- The section switch: off by default, stored through the section's public route ---
    expect((await getSection(request, admin, academy)).acceptsApplications).toBe(false)
    const switched = await putSectionPublic(request, admin, academy, { acceptsApplications: true })
    expect(switched.status, JSON.stringify(switched.body)).toBe(200)
    expect((await getSection(request, admin, academy)).acceptsApplications).toBe(true)
    const byCoordinator = await putSectionPublic(request, coordinator.token, academy, { acceptsApplications: false })
    expect(byCoordinator.status, JSON.stringify(byCoordinator.body)).toBe(200)
    expect((await getSection(request, admin, academy)).acceptsApplications).toBe(false)

    // --- The application settings: defaults, refusals, a save and an empty text restoring the built-in one ---
    const defaults = await readSettings(request, admin)
    expect(defaults.body).toMatchObject({
      applicationAgeReferenceDay: '09-01',
      applicationAnswerDays: 7,
      applicationInformation: null,
    })
    for (const data of [
      { applicationAgeReferenceDay: '02-30' },
      { applicationAgeReferenceDay: '02-29' },
      { applicationAnswerDays: 0 },
      { applicationAnswerDays: 61 },
      { applicationInformation: 'x'.repeat(6001) },
    ]) {
      const refused = await putSettings(request, admin, data)
      expect(refused.status, `${JSON.stringify(data).slice(0, 60)}: ${JSON.stringify(refused.body)}`).toBe(400)
    }
    const saved = await putSettings(request, admin, {
      applicationAgeReferenceDay: '08-15',
      applicationAnswerDays: 14,
      applicationInformation: 'Administratorem danych jest klub.',
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await readSettings(request, admin)).body).toMatchObject({
      applicationAgeReferenceDay: '08-15',
      applicationAnswerDays: 14,
      applicationInformation: 'Administratorem danych jest klub.',
    })
    expect((await putSettings(request, admin, { applicationInformation: '' })).status).toBe(200)
    expect((await readSettings(request, admin)).body?.applicationInformation).toBeNull()

    // --- The browser: the administrator edits a group's places and the settings ---
    // The browser sign-in ends the administrator's API token: take a fresh one (lesson `sign-in-browser-ends-the-api-token`).
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = admin
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.goto(`/backend/groups/groups/${zaki}?tab=public`)
    const limitInput = page.locator('[data-crud-field-id="placesLimit"] input')
    await expect(limitInput).toBeVisible()
    await limitInput.fill('0')
    const saveGroup = page.getByRole('button', { name: uiText('groups.common.save', { exact: true }) }).first()
    await saveGroup.click()
    await expect(page.locator('[data-crud-field-id="placesLimit"]')).toContainText(
      uiText('groups.groups.errors.placesLimit', { params: { max: '500' } }),
    )
    await limitInput.fill('18')
    // The CrudForm checkbox is a button with the checkbox role (plus an aria-hidden native input).
    const accepts = page.getByRole('checkbox', {
      name: uiText('groups.groups.fields.acceptsApplications', { exact: true }),
    })
    await expect(accepts).toBeChecked()
    await accepts.click()
    await expect(accepts).not.toBeChecked()
    await saveGroup.click()
    await expect
      .poll(async () => {
        const group = await groupDetail(request, admin, zaki)
        return [group.placesLimit, group.acceptsApplications]
      })
      .toEqual([18, false])
    await expect(page.getByTestId('group-places')).toHaveText(placesText('0 / 18'))
    await page.goto(`/backend/groups/groups/${recruits}`)
    await expect(page.getByTestId('group-places')).toHaveText(placesText('3 / 2'))
    await page.goto(`/backend/groups/groups?sectionId=${academy}`)
    await expect(page.getByTestId('group-participant-count').filter({ hasText: '3 / 2' })).toHaveCount(1)

    await page.goto('/backend/club/settings')
    await page.locator('[data-crud-field-id="applicationAgeReferenceDayOfMonth"] select').selectOption('31')
    await page.locator('[data-crud-field-id="applicationAgeReferenceMonth"] select').selectOption('4')
    const saveSettings = page.getByRole('button', { name: uiText('club_core.settings.save', { exact: true }) }).first()
    await saveSettings.click()
    await expect(page.locator('[data-crud-field-id="applicationAgeReferenceDayOfMonth"]')).toContainText(
      uiText('club_core.settings.errors.applicationAgeReferenceDay'),
    )
    await page.locator('[data-crud-field-id="applicationAgeReferenceDayOfMonth"] select').selectOption('1')
    await page.locator('[data-crud-field-id="applicationAgeReferenceMonth"] select').selectOption('9')
    await page.locator('[data-crud-field-id="applicationAnswerDays"] input').fill('10')
    await page.locator('[data-crud-field-id="applicationInformation"] textarea').fill('Dane przetwarza klub J01.')
    await saveSettings.click()
    await expect
      .poll(async () => {
        const settings = (await readSettings(request, admin)).body
        return [settings?.applicationAgeReferenceDay, settings?.applicationAnswerDays, settings?.applicationInformation]
      })
      .toEqual(['09-01', 10, 'Dane przetwarza klub J01.'])

    // --- 375 px, en and pl, light and dark: the settings, the group's public tab and the coordinator's phone page ---
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.goto('/backend/club/settings')
      await expect(page.locator('[data-crud-field-id="applicationAnswerDays"] input')).toHaveValue('10')
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/backend/club/settings (${locale})`,
          async () => {
            await expect(page.locator('[data-crud-field-id="applicationAnswerDays"] input')).toHaveValue('10')
          },
          { platformBaseline: true },
        ),
      )
      await page.goto(`/backend/groups/groups/${zaki}?tab=public`)
      await expect(page.locator('[data-crud-field-id="placesLimit"] input')).toHaveValue('18')
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/backend/groups/groups/[id]?tab=public (${locale})`,
          async () => {
            await expect(page.locator('[data-crud-field-id="placesLimit"] input')).toHaveValue('18')
          },
          { platformBaseline: true },
        ),
      )
    }

    await switchBrowserUser(page, request, club, coordinator.userId, coordinator.email)
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.goto('/club/groups')
      await expect(page.getByTestId('club-group').filter({ hasText: 'Nabór J01' })).toContainText('3 / 2')
      await expectNoPageOverflow(page)
      await page.goto(`/club/groups/${recruits}`)
      await expect(page.getByTestId('group-places')).toHaveText(placesText('3 / 2'))
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/groups/[id] (${locale})`, async () => {
          await expect(page.getByTestId('group-places')).toHaveText(placesText('3 / 2'))
        }),
      )
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
