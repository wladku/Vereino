import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { createGuardianship, setConsents } from '../_fixtures/people'

// Issue #104 (E06-S22; README M-10): the profile lists a guardian's wards with their age, account, groups with sections
// and the three consents with date and author; the ward page shows the groups; a ward with an account sees who their
// guardians are and the consents without controls, and a consent change of theirs is refused (403); a phone that is
// neither Polish nor E.164 is refused with 422 and a field message; "Change password" opens the `auth` page. The groups
// come from `GET /api/groups/member-groups`, which names only the caller's own person and wards.
test.describe.configure({ timeout: 300_000 })

type MemberGroupRow = { personId: string; groupName: string; sectionName: string | null; role: string }

test('E06-S22 profile: wards with groups and consents, a ward sees their guardians read-only, phone 422, change password', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s22-profile')
  try {
    const token = club.adminToken
    // A 14-year-old may have an own account in this club.
    const settings = await updateClubSettings(request, token, { ownAccountMinAge: 13 })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
    const orliki = await createGroup(request, token, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const swimmers = await createGroup(request, token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })

    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(40),
    })
    const tomekId = await createPerson(request, token, {
      firstName: 'Tomek',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(42),
    })
    const jasId = await createPerson(request, token, {
      firstName: 'Jaś',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(9),
    })
    const ola = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(14),
    })
    const strangerId = await createPerson(request, token, {
      firstName: 'Obcy',
      lastName: 'Zawodnik',
      birthDate: birthDateTurning(9),
    })
    const today = calendarDate()
    await createGuardianship(request, token, {
      guardianPersonId: kasia.personId,
      wardPersonId: jasId,
      isPrimaryPayer: true,
      validFrom: today,
    })
    const kasiaOla = await createGuardianship(request, token, {
      guardianPersonId: kasia.personId,
      wardPersonId: ola.personId,
      isPrimaryPayer: true,
      validFrom: today,
    })
    await createGuardianship(request, token, {
      guardianPersonId: tomekId,
      wardPersonId: ola.personId,
      relation: 'parent',
      validFrom: today,
    })
    await addMembership(request, token, { groupId: orliki, personId: jasId, role: 'participant', validFrom: today })
    await addMembership(request, token, {
      groupId: swimmers,
      personId: ola.personId,
      role: 'participant',
      validFrom: today,
    })
    await addMembership(request, token, {
      groupId: orliki,
      personId: strangerId,
      role: 'participant',
      validFrom: today,
    })

    // Kasia gives two consents for Jaś herself, so the author is a named person.
    const kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const before = await getMe(request, kasiaToken)
    const jasLink = before.body?.wards.find((ward) => ward.personId === jasId)?.guardianship
    const given = await setConsents(
      request,
      kasiaToken,
      String(jasLink?.id),
      { regulations: true, image: true },
      jasLink?.updatedAt,
    )
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    const olaLink = before.body?.wards.find((ward) => ward.personId === ola.personId)?.guardianship
    const olaGiven = await setConsents(request, kasiaToken, kasiaOla, { trips: true }, olaLink?.updatedAt)
    expect(olaGiven.status, JSON.stringify(olaGiven.body)).toBe(200)

    // GET /api/people/me: both wards with age, account state and the consents' author.
    const me = await getMe(request, kasiaToken)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    expect(me.body?.wards.map((ward) => [ward.firstName, ward.age, ward.hasAccount])).toEqual([
      ['Jaś', 9, false],
      ['Ola', 14, true],
    ])
    const jasConsents = me.body?.wards[0]?.guardianship.consents
    expect(jasConsents?.regulations).toMatchObject({
      granted: true,
      byPersonId: kasia.personId,
      byName: 'Kasia Rodzic',
    })
    expect(jasConsents?.trips).toMatchObject({ granted: false, at: null, byName: null })
    expect(me.body?.guardians).toEqual([])

    // GET /api/groups/member-groups: the groups of her wards with sections, never another family's child.
    const groups = await call<{ items: MemberGroupRow[] }>(request, 'GET', '/api/groups/member-groups', kasiaToken)
    expect(groups.status, JSON.stringify(groups.body)).toBe(200)
    const rows = (groups.body?.items ?? []).map((row) => [row.personId, row.groupName, row.sectionName, row.role])
    expect(rows).toEqual(
      expect.arrayContaining([
        [jasId, 'Orliki', 'Akademia piłkarska', 'participant'],
        [ola.personId, 'Basen — początkujący', 'Basen', 'participant'],
      ]),
    )
    expect(rows).toHaveLength(2)
    expect(rows.some(([personId]) => personId === strangerId)).toBe(false)

    // Ola (14) signed in: her guardians and the consents they gave; only her own groups; a consent change is 403.
    const olaToken = await signInAs(request, club, ola.userId, ola.email)
    const olaMe = await getMe(request, olaToken)
    expect(olaMe.status, JSON.stringify(olaMe.body)).toBe(200)
    expect(olaMe.body?.wards).toEqual([])
    expect(olaMe.body?.guardians.map((guardian) => [guardian.firstName, guardian.lastName])).toEqual([
      ['Kasia', 'Rodzic'],
      ['Tomek', 'Rodzic'],
    ])
    expect(olaMe.body?.guardians[0]?.consents.trips).toMatchObject({ granted: true, byName: 'Kasia Rodzic' })
    expect(olaMe.body?.paymentsVisible).toBe(false)
    const olaGroups = await call<{ items: MemberGroupRow[] }>(request, 'GET', '/api/groups/member-groups', olaToken)
    expect(olaGroups.body?.items.map((row) => [row.personId, row.groupName])).toEqual([
      [ola.personId, 'Basen — początkujący'],
    ])
    const refused = await setConsents(request, olaToken, kasiaOla, { image: true }, olaGiven.body?.updatedAt)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)

    // The phone: "abc" → 422 with the field message; a Polish and an E.164 number are saved.
    const invalid = await putMe(request, kasiaToken, { phone: 'abc' }, me.body?.person.updatedAt)
    expect(invalid.status, JSON.stringify(invalid.body)).toBe(422)
    expect(invalid.body).toMatchObject({ code: 'phone_invalid', fieldErrors: { phone: expect.any(String) } })
    const polish = await putMe(request, kasiaToken, { phone: '600 700 800' }, me.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)
    const international = await putMe(
      request,
      kasiaToken,
      { phone: '+49 151 1234 5678' },
      polish.body?.person?.updatedAt,
    )
    expect(international.status, JSON.stringify(international.body)).toBe(200)
    expect(international.body?.person?.phone).toBe('+49 151 1234 5678')

    // The app as Kasia: both wards with their groups and sections, at 375 px.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, kasia.userId, kasia.email)
    await page.goto('/club/profile')
    const wards = page.getByTestId('club-profile-ward')
    await expect(wards).toHaveCount(2)
    await expect(wards.nth(0)).toContainText('Jaś Rodzic')
    await expect(wards.nth(0).getByTestId('club-ward-group')).toHaveText('Orliki · Akademia piłkarska')
    await expect(wards.nth(0).getByTestId('club-consent-regulations')).toContainText('Kasia Rodzic')
    await expect(wards.nth(1).getByTestId('club-ward-group')).toHaveText('Basen — początkujący · Basen')
    await expect(wards.nth(1)).toContainText(/Own account|Własne konto/)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'member profile',
      async () => {
        await expect(page.getByTestId('club-ward-group').first()).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)

    // The phone error appears under the field and the typed value stays.
    const phone = page.getByLabel(/^(Phone|Telefon)$/)
    await phone.fill('abc')
    await page.getByRole('button', { name: /Save profile|Zapisz profil/ }).click()
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(/Enter a Polish phone number|Podaj polski numer telefonu/)).toBeVisible()
    await expect(phone).toHaveValue('abc')

    // The ward page shows the groups.
    await page.goto(`/club/wards/${jasId}`)
    await expect(page.getByTestId('club-ward-groups').getByTestId('club-ward-group')).toHaveText(
      'Orliki · Akademia piłkarska',
    )

    // "Change password" opens the auth page.
    await page.goto('/club/profile')
    await page.getByTestId('club-profile-change-password').click()
    await expect(page).toHaveURL(/\/backend\/profile\/change-password$/)
    await expect(page.locator('input[type="password"]').first()).toBeVisible()

    // The app as Ola: her guardians and the consents without controls; no wards section.
    await page.context().clearCookies()
    await signInBrowser(page, request, club, ola.userId, ola.email)
    await page.goto('/club/profile')
    const guardians = page.getByTestId('club-profile-guardians')
    await expect(guardians).toContainText(/Kasia Rodzic, Tomek Rodzic/)
    await expect(guardians.getByTestId('club-profile-guardian')).toHaveCount(2)
    await expect(guardians.getByTestId('club-consent-trips').first()).toContainText(/Given|Udzielona/)
    await expect(guardians.getByRole('switch')).toHaveCount(0)
    await expect(page.getByRole('switch')).toHaveCount(0)
    await expect(page.getByTestId('club-profile-wards')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
