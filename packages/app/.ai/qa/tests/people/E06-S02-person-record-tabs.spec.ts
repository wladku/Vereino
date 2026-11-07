import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  uniqueSuffix,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// E06-S02 (#84; README B-10, flow F-01): the person record's Groups tab with the membership history (ended ones
// included, a coordinator sees only the groups of their sections), `?tab=` deep links, a created person landing on the
// guardianship tab, and the Account tab showing "Account active" with the login e-mail to every reader of the record
// while only `people.accounts.manage` gets "Create account".
test.describe.configure({ timeout: 300_000 })

type PersonBody = { accountEmail?: string | null; access?: string }
type MembershipList = { items?: { groupId: string; group?: { name: string; sectionName: string | null } | null }[] }

test('E06-S02 the person record: Groups tab with history and scope, ?tab= links, create lands on guardianship, account status', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e06-s02-record')
  try {
    let token = club.adminToken
    const today = calendarDate()
    const endedOn = calendarDate(-30)
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia E06' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen E06' })
    const zaki = await createGroup(request, token, { sectionId: academy, name: 'Żaki E06', kind: 'team' })
    const orliki = await createGroup(request, token, { sectionId: academy, name: 'Orliki E06', kind: 'team' })
    const swim = await createGroup(request, token, { sectionId: pool, name: 'Pływanie E06', kind: 'class_group' })
    const child = await createPerson(request, token, {
      firstName: 'Jaś',
      lastName: 'Grupowy',
      birthDate: birthDateTurning(9),
    })
    // One ended and one active membership in the academy, one active in the pool.
    await addMembership(request, token, {
      groupId: zaki,
      personId: child,
      role: 'participant',
      validFrom: '2025-09-01',
      validTo: endedOn,
    })
    await addMembership(request, token, { groupId: orliki, personId: child, role: 'participant', validFrom: today })
    await addMembership(request, token, { groupId: swim, personId: child, role: 'participant', validFrom: today })

    // The memberships list names the group and its section for each row.
    const listed = await call<MembershipList>(
      request,
      'GET',
      `/api/groups/memberships?personId=${child}&pageSize=100`,
      token,
    )
    expect(listed.status).toBe(200)
    const names = Object.fromEntries(
      (listed.body?.items ?? []).map((item) => [item.groupId, [item.group?.name, item.group?.sectionName]]),
    )
    expect(names).toEqual({
      [zaki]: ['Żaki E06', 'Akademia E06'],
      [orliki]: ['Orliki E06', 'Akademia E06'],
      [swim]: ['Pływanie E06', 'Basen E06'],
    })

    page.setDefaultTimeout(30_000)
    // The browser sign-in sets a new password, which ends the administrator's API session: sign in again.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    token = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = token

    // `?tab=groups`: the administrator sees all three memberships, the ended one marked as ended, with its dates.
    await page.goto(`/backend/people/persons/${child}?tab=groups`)
    await expect(page.getByRole('tab', { name: /^Groups$|^Grupy$/ })).toHaveAttribute('aria-selected', 'true')
    const memberships = page.getByRole('list', { name: /Group memberships of the person|Członkostwa osoby w grupach/ })
    await expect(memberships.getByRole('listitem')).toHaveCount(3)
    const ended = memberships.getByRole('listitem').filter({ hasText: 'Żaki E06' })
    await expect(ended).toHaveAttribute('data-membership-status', 'ended')
    await expect(ended.getByText(/^Ended$|^Zakończone$/)).toBeVisible()
    await expect(ended.getByText(`2025-09-01 – ${endedOn}`)).toBeVisible()
    await expect(ended.getByText('Akademia E06')).toBeVisible()
    const active = memberships.getByRole('listitem').filter({ hasText: 'Orliki E06' })
    await expect(active).toHaveAttribute('data-membership-status', 'active')
    await expect(active.getByText(new RegExp(`(from|od) ${today}`))).toBeVisible()
    await expect(memberships.getByRole('listitem').filter({ hasText: 'Pływanie E06' })).toBeVisible()

    // `?tab=roles` opens the Roles tab; choosing a tab writes it into the URL.
    await page.goto(`/backend/people/persons/${child}?tab=roles`)
    await expect(page.getByRole('tab', { name: /^Roles$|^Role$/ })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/people/persons/${child}\\?tab=account$`))
    // An unknown tab falls back to Details.
    await page.goto(`/backend/people/persons/${child}?tab=charges`)
    await expect(page.getByRole('tab', { name: /^Details$|^Dane$/ })).toHaveAttribute('aria-selected', 'true')

    // F-01: a new person saved through the form opens on the guardianship tab.
    await page.goto('/backend/people/persons/create')
    await page.locator('[data-crud-field-id="firstName"] input').fill('Kasia')
    await page.locator('[data-crud-field-id="lastName"] input').fill('Nowa E06')
    await page.locator('[data-crud-field-id="birthDate"] input[type="date"]').fill(birthDateTurning(38))
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/people\/persons\/[0-9a-f-]{36}\?tab=guardianship$/)
    await expect(page.getByRole('tab', { name: /Guardianship|Opieka/ })).toHaveAttribute('aria-selected', 'true')
    const kasiaId = new URL(page.url()).pathname.split('/').pop() as string

    // A person with an account: "Account active" and the login e-mail (not the contact e-mail).
    const loginEmail = `kasia-login-${uniqueSuffix()}@example.org`
    const account = await createAccount(request, token, kasiaId, loginEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    club.extraUserIds.push(String(account.body?.userId))
    const detail = await call<PersonBody>(request, 'GET', `/api/people/persons/${kasiaId}`, token)
    expect(detail.body?.accountEmail).toBe(loginEmail)
    await page.goto(`/backend/people/persons/${kasiaId}?tab=account`)
    await expect(page.getByText(/^Account active$|^Konto aktywne$/)).toBeVisible()
    await expect(page.getByText(`Login: ${loginEmail}`)).toBeVisible()
    await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toHaveCount(0)

    // The coordinator of the academy (no `people.accounts.manage`): the Account tab shows the status and no button,
    // and the Groups tab lists only the academy's memberships, the pool's one is not there.
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Marta',
      lastName: 'Koordynatorka',
      role: 'coordinator',
      sectionId: academy,
    })
    const scoped = await call<MembershipList>(
      request,
      'GET',
      `/api/groups/memberships?personId=${child}&pageSize=100`,
      coordinator.token,
    )
    expect(scoped.status).toBe(200)
    expect((scoped.body?.items ?? []).map((item) => item.groupId).sort()).toEqual([zaki, orliki].sort())
    await switchBrowserUser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/backend/people/persons/${child}?tab=account`)
    await expect(page.getByRole('tab', { name: /^Account$|^Konto$/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(/This person has no account yet|Ta osoba nie ma jeszcze konta/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toHaveCount(0)
    await page.getByRole('tab', { name: /^Groups$|^Grupy$/ }).click()
    const coordinatorList = page.getByRole('list', {
      name: /Group memberships of the person|Członkostwa osoby w grupach/,
    })
    await expect(coordinatorList.getByRole('listitem')).toHaveCount(2)
    await expect(coordinatorList.getByText('Pływanie E06')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
