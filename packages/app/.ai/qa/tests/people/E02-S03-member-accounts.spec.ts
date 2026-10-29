import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  createSecondOrganization,
  expectRoles,
  getPerson,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import {
  acceptInvitation,
  capturedEmails,
  checkOwnPayments,
  getMe,
  hasFeatures,
  putMe,
  setUserFeatures,
  signInThroughForm,
} from '../_fixtures/members'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'

// Issue #27 (E02-S03; club spec phase 1 steps 4, 4a and 5): a guardian signs in and sees every ward in their language;
// a ward from the club's threshold gets a limited account without payments. Every acceptance criterion of the issue
// body and of its 2026-10-26 clarification has an assertion here; the threshold setting is TEST-055, the families and
// roles TEST-003, the locale TEST-047 and the pages' states TEST-006. The payments routes arrive with phase 4: the R10
// gate they will call (`people.paymentsGate`) is exercised through its operator CLI, and the feature it needs is
// checked through the platform's feature check. Until the `payments` module is enabled the platform grants none of its
// features (`isFeatureEnabled`), so today every caller is refused: an adult for the missing feature (`scope_denied`),
// a minor for the age (`payments_minor`), which the gate checks first — also with the feature (unit test).
test.describe.configure({ timeout: 300_000 })

/** A person with an account in the club; returns its ids and the invitation address. */
async function personWithAccount(
  request: Parameters<typeof createPerson>[0],
  club: Club,
  input: { firstName: string; lastName: string; birthDate: string; preferredLocale?: string },
) {
  const personId = await createPerson(request, club.adminToken, input)
  const email = `${input.firstName.toLowerCase()}-${uniqueSuffix()}@example.org`
  const account = await createAccount(request, club.adminToken, personId, email)
  expect(account.status, JSON.stringify(account.body)).toBe(201)
  const userId = String(account.body?.userId)
  club.extraUserIds.push(userId)
  return { personId, userId, email }
}

test('E02-S03 guardian account: the password-setup e-mail, the sign-in lands on /club with every ward and its consents', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e02-s03-guardian')
  try {
    const marker = randomUUID().slice(0, 6)
    const guardianId = await createPerson(request, club.adminToken, {
      firstName: 'Kasia',
      lastName: `Opiekun${marker}`,
      birthDate: birthDateTurning(40),
    })
    const olderId = await createPerson(request, club.adminToken, {
      firstName: 'Ola',
      lastName: `Dziecko${marker}`,
      birthDate: birthDateTurning(12),
    })
    const youngerId = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: `Dziecko${marker}`,
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardianId,
      wardPersonId: youngerId,
      isPrimaryPayer: true,
      consents: { regulations: true, image: true },
      validFrom: calendarDate(),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardianId,
      wardPersonId: olderId,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: calendarDate(),
    })

    // "Create account": the platform account with the member and payer roles, and the password-setup e-mail.
    const email = `kasia-${uniqueSuffix()}@example.org`
    const account = await createAccount(request, club.adminToken, guardianId, email)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const userId = String(account.body?.userId)
    club.extraUserIds.push(userId)
    await expectRoles(request, club, userId, ['vereino_member', 'vereino_payer'])
    const password = await acceptInvitation(request, email)

    // Her profile names both wards with their consents; she may see payments (an adult payer).
    const token = await getAuthToken(request, email, password)
    const me = await getMe(request, token)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    expect(me.body?.person).toMatchObject({ id: guardianId, firstName: 'Kasia' })
    expect(me.body?.contexts).toEqual(['self', 'guardian'])
    expect(me.body?.wards.map((ward) => ward.firstName)).toEqual(['Jaś', 'Ola'])
    const younger = me.body?.wards.find((ward) => ward.personId === youngerId)
    expect(younger?.guardianship.isPrimaryPayer).toBe(true)
    expect(younger?.guardianship.consents.regulations.granted).toBe(true)
    expect(younger?.guardianship.consents.image.granted).toBe(true)
    expect(younger?.guardianship.consents.trips.granted).toBe(false)
    const older = me.body?.wards.find((ward) => ward.personId === olderId)
    expect(older?.guardianship.consents.image.granted).toBe(false)

    // The real sign-in form lands on /club with every ward; a ward opens with its consents.
    page.setDefaultTimeout(30_000)
    await signInThroughForm(page, email, password)
    await expect(page).toHaveURL(/\/club$/)
    await expect(page.getByRole('heading', { level: 1, name: /Hello, Kasia|Cześć, Kasia/ })).toBeVisible()
    await expect(page.getByTestId('club-ward')).toHaveCount(2)
    await page.getByRole('link', { name: new RegExp(`Jaś Dziecko${marker}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/club/wards/${youngerId}$`))
    await expect(page.getByRole('switch', { name: /Image|Wizerunek/ })).toBeChecked()
    await expect(page.getByRole('switch', { name: /Trips|Wyjazdy/ })).not.toBeChecked()
  } finally {
    await club.cleanup()
  }
})

test('E02-S03 ward accounts: below the threshold 422; at the threshold an own account without the guardian having one, with no payments tile, screen or API', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e02-s03-ward')
  try {
    // The guardian has no account; it never blocks the ward's own account.
    const guardianId = await createPerson(request, club.adminToken, {
      firstName: 'Bez',
      lastName: 'Konta',
      birthDate: birthDateTurning(45),
    })
    const youngId = await createPerson(request, club.adminToken, {
      firstName: 'Piotr',
      lastName: 'Młodszy',
      birthDate: birthDateTurning(15),
    })
    const below = await createAccount(request, club.adminToken, youngId, `piotr-${uniqueSuffix()}@example.org`)
    expect(below.status).toBe(422)
    expect(below.body).toMatchObject({ code: 'account_age_below_threshold', threshold: 16 })

    const teenId = await createPerson(request, club.adminToken, {
      firstName: 'Zuzia',
      lastName: 'Szesnastka',
      birthDate: birthDateTurning(16),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardianId,
      wardPersonId: teenId,
      isPrimaryPayer: true,
      validFrom: calendarDate(),
    })
    const teenEmail = `zuzia-${uniqueSuffix()}@example.org`
    const teenAccount = await createAccount(request, club.adminToken, teenId, teenEmail)
    expect(teenAccount.status, JSON.stringify(teenAccount.body)).toBe(201)
    const teenUserId = String(teenAccount.body?.userId)
    club.extraUserIds.push(teenUserId)
    await expectRoles(request, club, teenUserId, ['vereino_member'])
    expect((await getPerson(request, club.adminToken, guardianId)).body).toMatchObject({ hasAccount: false })

    // Her own profile: no wards, no payments; the payer feature is absent and the R10 gate refuses with 403.
    const token = await signInAs(request, club, teenUserId, teenEmail)
    const me = await getMe(request, token)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    expect(me.body?.person.id).toBe(teenId)
    expect(me.body?.wards).toEqual([])
    expect(me.body?.contexts).toEqual(['self'])
    expect(me.body?.paymentsVisible).toBe(false)
    expect(await hasFeatures(request, token, ['payments.view_own'])).toBe(false)
    expect(checkOwnPayments(club, teenUserId)).toEqual({ allowed: false, status: 403, code: 'payments_minor' })

    // A manually granted payer feature does not open payments to a minor: the gate checks the age first.
    await setUserFeatures(request, club, teenUserId, ['people.self', 'payments.view_own'])
    expect(await hasFeatures(request, token, ['people.self'])).toBe(true)
    expect(checkOwnPayments(club, teenUserId)).toEqual({ allowed: false, status: 403, code: 'payments_minor' })
    expect((await getMe(request, token)).body?.paymentsVisible).toBe(false)

    // The app: profile and calendar entry points, no wards section, no payments tile and no payments screen.
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, teenUserId, teenEmail)
    await page.goto('/club')
    await expect(page.getByRole('heading', { level: 1, name: /Hello, Zuzia|Cześć, Zuzia/ })).toBeVisible()
    await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
    await expect(page.getByTestId('club-tile-profile')).toBeVisible()
    await expect(page.getByTestId('club-wards')).toHaveCount(0)
    await expect(page.getByText(/Payments|Płatności/)).toHaveCount(0)
    const paymentsScreen = await page.goto('/club/payments')
    expect(paymentsScreen?.status()).toBe(404)
  } finally {
    await club.cleanup()
  }
})

test('E02-S03 the two consents in the profile: given with the date, withdrawable at any time, audited and undoable; stale 409, unknown locale 422', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s03-consents')
  try {
    const guardian = await personWithAccount(request, club, {
      firstName: 'Ewa',
      lastName: 'Zgodna',
      birthDate: birthDateTurning(38),
    })
    const wardId = await createPerson(request, club.adminToken, {
      firstName: 'Antek',
      lastName: 'Zgodny',
      birthDate: birthDateTurning(10),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardian.personId,
      wardPersonId: wardId,
      validFrom: calendarDate(),
    })
    const token = await signInAs(request, club, guardian.userId, guardian.email)
    const initial = await getMe(request, token)
    expect(initial.body?.person.consents).toEqual({
      shareContactWithCoaches: { granted: false, at: null },
      sharePresenceWithGuardians: { granted: false, at: null },
    })

    // Given: stored with its date.
    const given = await putMe(request, token, { shareContactWithCoaches: true }, initial.body?.person.updatedAt)
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    expect(given.body?.actingRole).toBe('self')
    const contactAt = given.body?.person?.consents.shareContactWithCoaches.at
    expect(given.body?.person?.consents.shareContactWithCoaches.granted).toBe(true)
    expect(Date.parse(String(contactAt))).toBeGreaterThan(Date.now() - 120_000)
    expect(given.body?.person?.consents.sharePresenceWithGuardians.granted).toBe(false)

    // Giving it again keeps the first date; the second consent gets its own.
    const both = await putMe(
      request,
      token,
      { shareContactWithCoaches: true, sharePresenceWithGuardians: true },
      given.body?.person?.updatedAt,
    )
    expect(both.status, JSON.stringify(both.body)).toBe(200)
    expect(both.body?.person?.consents.shareContactWithCoaches.at).toBe(contactAt)
    expect(both.body?.person?.consents.sharePresenceWithGuardians.granted).toBe(true)

    // The administrator's person record shows the dates.
    const record = await getPerson(request, club.adminToken, guardian.personId)
    expect(record.body).toMatchObject({ shareContactWithCoachesAt: contactAt })

    // Withdrawn at any time; a stale version is refused.
    const withdrawn = await putMe(request, token, { shareContactWithCoaches: false }, both.body?.person?.updatedAt)
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    expect(withdrawn.body?.person?.consents.shareContactWithCoaches).toEqual({ granted: false, at: null })
    const stale = await putMe(request, token, { sharePresenceWithGuardians: false }, both.body?.person?.updatedAt)
    expect(stale.status).toBe(409)
    expect((await getMe(request, token)).body?.person.consents.sharePresenceWithGuardians.granted).toBe(true)

    // Language and input checks: unknown locale 422, malformed 400, a foreign field 400.
    const current = (await getMe(request, token)).body?.person.updatedAt
    const unknown = await putMe(request, token, { preferredLocale: 'xx' }, current)
    expect(unknown.status).toBe(422)
    expect(unknown.body?.code).toBe('locale_unsupported')
    expect((await putMe(request, token, { preferredLocale: 'Polish' }, current)).status).toBe(400)
    expect((await putMe(request, token, { organizationId: club.tenant.organizationId }, current)).status).toBe(400)
    const english = await putMe(request, token, { preferredLocale: 'en' }, current)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    expect(english.body?.locale).toBe('en')
    expect(english.body?.person?.preferredLocale).toBe('en')

    // Audited with the acting role and the changed consents; undo of the withdrawal restores the first date.
    await setUserFeatures(request, club, guardian.userId, [
      'people.self',
      'audit_logs.view_self',
      'audit_logs.undo_self',
    ])
    const logs = (await actionLogEntries(request, token, guardian.personId)).filter(
      (entry) => entry.commandId === 'people.persons.update_self',
    )
    expect(logs.length).toBe(4)
    expect(logs.every((entry) => entry.context?.actingRole === 'self')).toBe(true)
    expect(logs.map((entry) => entry.context?.consentsChanged)).toEqual([
      [],
      ['shareContactWithCoaches'],
      ['sharePresenceWithGuardians'],
      ['shareContactWithCoaches'],
    ])
    // Newest first: undo the language change, then the withdrawal.
    for (const entry of logs.slice(0, 2)) {
      const undone = await undoByToken(request, token, String(entry.undoToken))
      expect(undone.status(), await undone.text()).toBe(200)
    }
    const restored = await getMe(request, token)
    expect(restored.body?.person.preferredLocale).toBeNull()
    expect(restored.body?.person.consents.shareContactWithCoaches).toEqual({ granted: true, at: contactAt })
  } finally {
    await club.cleanup()
  }
})

test('E02-S03 adult participant without wards: member and payer roles, lands on /club with own profile and calendar, no wards section', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e02-s03-adult')
  try {
    const sectionId = await createStructure(request, club.adminToken, 'sections', { name: 'Zumba' })
    const groupId = await createGroup(request, club.adminToken, {
      sectionId,
      name: 'Zumba dorośli',
      kind: 'class_group',
    })
    const kasiaId = await createPerson(request, club.adminToken, {
      firstName: 'Kasia',
      lastName: 'Uczestniczka',
      birthDate: birthDateTurning(29),
    })
    await addMembership(request, club.adminToken, {
      groupId,
      personId: kasiaId,
      role: 'participant',
      validFrom: calendarDate(),
    })
    const email = `kasia-${uniqueSuffix()}@example.org`
    const account = await createAccount(request, club.adminToken, kasiaId, email)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const userId = String(account.body?.userId)
    club.extraUserIds.push(userId)
    await expectRoles(request, club, userId, ['vereino_member', 'vereino_payer'])
    const password = await acceptInvitation(request, email)

    const token = await getAuthToken(request, email, password)
    const me = await getMe(request, token)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    expect(me.body?.wards).toEqual([])
    // An adult is never refused for the age: today only the payer feature is missing (no payments module yet).
    expect(checkOwnPayments(club, userId)).toEqual({ allowed: false, status: 403, code: 'scope_denied' })

    page.setDefaultTimeout(30_000)
    await signInThroughForm(page, email, password)
    await expect(page).toHaveURL(/\/club$/)
    await expect(page.getByRole('heading', { level: 1, name: /Hello, Kasia|Cześć, Kasia/ })).toBeVisible()
    await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
    await expect(page.getByTestId('club-tile-profile')).toBeVisible()
    await expect(page.getByTestId('club-wards')).toHaveCount(0)
    // No guardian consents for a person without wards.
    await page.getByTestId('club-tile-profile').click()
    await expect(page).toHaveURL(/\/club\/profile$/)
    await expect(page.getByRole('heading', { level: 1, name: /Profile|Profil/ })).toBeVisible()
    await expect(page.getByTestId('club-profile-consents')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})

test('E02-S03 a second "Create account" answers 409 and creates no second account or e-mail', async ({ request }) => {
  const club = await createClub(request, 'e02-s03-second')
  try {
    const first = await personWithAccount(request, club, {
      firstName: 'Marta',
      lastName: 'Jednokontowa',
      birthDate: birthDateTurning(33),
    })
    const otherEmail = `marta-${uniqueSuffix()}@example.org`
    const again = await createAccount(request, club.adminToken, first.personId, otherEmail)
    expect(again.status).toBe(409)
    expect(again.body?.code).toBe('account_exists')
    const sameAgain = await createAccount(request, club.adminToken, first.personId, first.email)
    expect(sameAgain.status).toBe(409)
    expect(capturedEmails(otherEmail)).toEqual([])
    expect(capturedEmails(first.email)).toHaveLength(1)
    const users = await call<{ items?: { id: string; email?: string }[] }>(
      request,
      'GET',
      `/api/auth/users?search=${encodeURIComponent(otherEmail)}`,
      club.superToken,
    )
    expect(users.body?.items?.some((user) => user.email === otherEmail) ?? false).toBe(false)
    expect((await getPerson(request, club.adminToken, first.personId)).body).toMatchObject({ userId: first.userId })
  } finally {
    await club.cleanup()
  }
})

test("E02-S03 an account linked to no person lands on the admin panel with a notice and never sees another person's data", async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e02-s03-unlinked')
  try {
    const marker = `Cudzy${randomUUID().slice(0, 6)}`
    const someoneId = await createPerson(request, club.adminToken, {
      firstName: 'Obcy',
      lastName: marker,
      birthDate: birthDateTurning(9),
    })
    const parentId = await createPerson(request, club.adminToken, {
      firstName: 'Rodzic',
      lastName: marker,
      birthDate: birthDateTurning(40),
    })
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: parentId,
      wardPersonId: someoneId,
      validFrom: calendarDate(),
    })
    const email = `unlinked-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const userId = await createUserFixture(request, club.superToken, {
      email,
      password,
      organizationId: club.tenant.organizationId,
      roles: [club.tenant.roleId],
    })
    club.extraUserIds.push(userId)
    await setUserFeatures(request, club, userId, ['people.self'])

    const token = await getAuthToken(request, email, password)
    const me = await getMe(request, token)
    expect(me.status).toBe(404)
    expect(me.body?.code).toBe('person_not_linked')
    expect(JSON.stringify(me.body)).not.toContain(marker)

    page.setDefaultTimeout(30_000)
    await signInThroughForm(page, email, password)
    await expect(page).toHaveURL(/\/backend/)
    await expect(page.getByText(/not linked to a person|nie jest powiązane z osobą/).first()).toBeVisible()
    await page.goto('/club')
    await expect(page.getByTestId('club-not-linked')).toBeVisible()
    await expect(page.getByRole('link', { name: /Go to the admin panel|Przejdź do panelu/ })).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
    await page.goto(`/club/wards/${someoneId}`)
    await expect(page.getByTestId('club-not-linked')).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})

test('E02-S03 /api/people/me in two tenants and two organizations: each caller gets only their own person and wards', async ({
  request,
}) => {
  const clubA = await createClub(request, 'e02-s03-tenant-a')
  const clubB = await createClub(request, 'e02-s03-tenant-b')
  try {
    const family = async (club: Club, label: string) => {
      const guardian = await personWithAccount(request, club, {
        firstName: `Opiekun${label}`,
        lastName: 'Rodzina',
        birthDate: birthDateTurning(41),
      })
      const wardId = await createPerson(request, club.adminToken, {
        firstName: `Dziecko${label}`,
        lastName: 'Rodzina',
        birthDate: birthDateTurning(8),
      })
      await createGuardianship(request, club.adminToken, {
        guardianPersonId: guardian.personId,
        wardPersonId: wardId,
        validFrom: calendarDate(),
      })
      const token = await signInAs(request, club, guardian.userId, guardian.email)
      return { ...guardian, wardId, token }
    }
    const a = await family(clubA, 'A')
    const b = await family(clubB, 'B')

    const meA = await getMe(request, a.token)
    expect(meA.status).toBe(200)
    expect(meA.body?.person.id).toBe(a.personId)
    expect(meA.body?.wards.map((ward) => ward.personId)).toEqual([a.wardId])
    const meB = await getMe(request, b.token)
    expect(meB.body?.person.id).toBe(b.personId)
    expect(meB.body?.wards.map((ward) => ward.personId)).toEqual([b.wardId])
    for (const id of [b.personId, b.wardId]) expect(JSON.stringify(meA.body)).not.toContain(id)

    // A second organization of tenant A with its own family: A's caller selecting it gets nothing of it.
    const second = await createSecondOrganization(request, clubA)
    const otherId = await createPerson(request, second.adminToken, {
      firstName: 'Inna',
      lastName: 'Organizacja',
      birthDate: birthDateTurning(10),
    })
    for (const selected of [second.organizationId, clubB.tenant.organizationId]) {
      const crossed = await getMe(request, a.token, { Cookie: `om_selected_org=${selected}` })
      expect([200, 401, 403, 404]).toContain(crossed.status)
      if (crossed.status === 200) expect(crossed.body?.person.id).toBe(a.personId)
      for (const id of [otherId, b.personId, b.wardId]) expect(JSON.stringify(crossed.body)).not.toContain(id)
    }
    // A write through /me never reaches another tenant's person either.
    const write = await putMe(request, a.token, { phone: '+48 600 000 000' }, meA.body?.person.updatedAt)
    expect(write.status, JSON.stringify(write.body)).toBe(200)
    expect((await getPerson(request, clubB.adminToken, b.personId)).body).toMatchObject({ phone: null })
  } finally {
    await clubB.cleanup()
    await clubA.cleanup()
  }
})
