import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { scanBlockingViolations } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  createStaff,
  getAssignment,
  getPerson,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { postGroup } from '../_fixtures/groups'

// TEST-076 (#76): an account that passes the feature check but is not linked to a person of the club gets 403
// `scope_unlinked` with a message naming the fix (en + pl) — on a create command, on an update of a record that exists
// and of one that does not (the same answer, so nothing reveals whether a record exists), in another module's command
// and on a detail route — and nothing is created; a linked coordinator outside the record's section still gets 403
// `scope_denied` with the old message. The person create form shows the new message under the form, and the person
// record page renders it as its own 403 state (axe-clean).
test.describe.configure({ timeout: 300_000 })

const UNLINKED_EN =
  'Your account is not linked to a person of this club, so it has no access to club records. A club administrator must link it. In a new club, the first administrator is set up with: yarn mercato people bootstrap-admin'
const UNLINKED_PL =
  'Twoje konto nie jest powiązane z osobą w tym klubie, więc nie ma dostępu do danych klubu. Musi je powiązać administrator klubu. W nowym klubie pierwszego administratora tworzy się poleceniem: yarn mercato people bootstrap-admin'
const DENIED_EN = 'You do not have access to this record.'
const DENIED_PL = 'Nie masz dostępu do tego rekordu.'
const EN = { Cookie: 'locale=en' }
const PL = { Cookie: 'locale=pl' }

type Coded = { code?: string; error?: string; id?: string }
type ListBody = { items?: { id: string }[]; total?: number }

test('TEST-076 an account with no linked club person gets 403 scope_unlinked; a coordinator of another section keeps scope_denied', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-076')
  try {
    const marker = `Niepowiazany${randomUUID().slice(0, 6)}`
    const sectionA = await createStructure(request, club.adminToken, 'sections', { name: `Sekcja A ${marker}` })
    const sectionB = await createStructure(request, club.adminToken, 'sections', { name: `Sekcja B ${marker}` })
    const existingId = await createPerson(request, club.adminToken, { firstName: 'Obecna', lastName: marker })
    const existing = await getPerson(request, club.adminToken, existingId)
    const otherCoordinatorId = await createPerson(request, club.adminToken, { firstName: 'Bartek', lastName: marker })
    const assignmentB = await assignRole(request, club.adminToken, {
      personId: otherCoordinatorId,
      role: 'coordinator',
      sectionId: sectionB,
      validFrom: '2020-01-01',
    })
    const totalBefore = (await call<ListBody>(request, 'GET', '/api/people/persons?pageSize=1', club.adminToken)).body
      ?.total

    // A tenant administrator account with every `people` feature (the club administrator's platform role) and no
    // person of the club linked to it — the state of a new club before `people bootstrap-admin`.
    const email = `unlinked-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const unlinkedId = await createUserFixture(request, club.superToken, {
      email,
      password,
      organizationId: club.tenant.organizationId,
      roles: ['vereino_club_admin'],
    })
    club.extraUserIds.push(unlinkedId)
    const unlinkedToken = await getAuthToken(request, email, password)

    // Create a person: 403 `scope_unlinked`, the message in en and pl, nothing created.
    const person = { firstName: 'Nowa', lastName: marker }
    for (const [headers, message] of [
      [EN, UNLINKED_EN],
      [PL, UNLINKED_PL],
    ] as const) {
      const created = await call<Coded>(request, 'POST', '/api/people/persons', unlinkedToken, {
        data: person,
        headers,
      })
      expect(created.status, JSON.stringify(created.body)).toBe(403)
      expect(created.body?.code).toBe('scope_unlinked')
      expect(created.body?.error).toBe(message)
      expect(created.body).not.toHaveProperty('id')
    }
    const totalAfter = (await call<ListBody>(request, 'GET', '/api/people/persons?pageSize=1', club.adminToken)).body
      ?.total
    expect(totalAfter).toBe(totalBefore)

    // An update of a person that exists and of one that does not: the same 403 (refused before the lookup), so the
    // answer reveals nothing about the record; the existing person is unchanged.
    for (const id of [existingId, randomUUID()]) {
      const updated = await call<Coded>(request, 'PUT', '/api/people/persons', unlinkedToken, {
        data: { id, firstName: 'Przejęta' },
        headers: { ...EN, [OPTIMISTIC_LOCK_HEADER]: String(existing.body?.updatedAt) },
      })
      expect(updated.status, JSON.stringify(updated.body)).toBe(403)
      expect(updated.body).toMatchObject({ code: 'scope_unlinked', error: UNLINKED_EN })
    }
    expect((await getPerson(request, club.adminToken, existingId)).body?.firstName).toBe('Obecna')

    // Another module's command (a group in section B) and the detail routes answer the same code.
    const group = await postGroup(request, unlinkedToken, { sectionId: sectionB, name: marker, kind: 'class_group' })
    expect(group.status, JSON.stringify(group.body)).toBe(403)
    expect(group.body?.code).toBe('scope_unlinked')
    const detail = await call<Coded>(request, 'GET', `/api/people/persons/${existingId}`, unlinkedToken, {
      headers: PL,
    })
    expect(detail.status).toBe(403)
    expect(detail.body).toMatchObject({ code: 'scope_unlinked', error: UNLINKED_PL })
    const assignmentDetail = await getAssignment(request, unlinkedToken, assignmentB)
    expect(assignmentDetail.status).toBe(403)
    expect(assignmentDetail.body?.code).toBe('scope_unlinked')

    // A linked coordinator of section A outside section B: still 403 `scope_denied` with the old message, on a
    // command (`authorizeScoped`) and on a detail route (`assertInScope`).
    const coordinator = await createStaff(request, club, {
      firstName: 'Celina',
      lastName: marker,
      birthDate: birthDateTurning(35),
    })
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    const coordinatorToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    const foreignGroup = await postGroup(request, coordinatorToken, {
      sectionId: sectionB,
      name: marker,
      kind: 'class_group',
    })
    expect(foreignGroup.status, JSON.stringify(foreignGroup.body)).toBe(403)
    expect(foreignGroup.body?.code).toBe('scope_denied')
    for (const [headers, message] of [
      [EN, DENIED_EN],
      [PL, DENIED_PL],
    ] as const) {
      const denied = await call<Coded>(
        request,
        'GET',
        `/api/people/role-assignments/${assignmentB}`,
        coordinatorToken,
        {
          headers,
        },
      )
      expect(denied.status).toBe(403)
      expect(denied.body).toMatchObject({ code: 'scope_denied', error: message })
    }

    // The create form shows the message under the form and stays on the page; nothing is created (counted after
    // the coordinator's own person record above).
    const totalBeforeForm = (await call<ListBody>(request, 'GET', '/api/people/persons?pageSize=1', club.adminToken))
      .body?.total
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, unlinkedId, email)
    const origin = new URL(testInfo.project.use.baseURL ?? 'http://localhost:3000').origin
    for (const [locale, message] of [
      ['en', UNLINKED_EN],
      ['pl', UNLINKED_PL],
    ] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: origin }])
      await page.goto('/backend/people/persons/create')
      await page.locator('[data-crud-field-id="firstName"] input').fill('Nowa')
      await page.locator('[data-crud-field-id="lastName"] input').fill(marker)
      await page
        .getByRole('button', { name: /^Create$|^Utwórz$/ })
        .first()
        .click()
      await expect(page.getByText(message).first()).toBeVisible()
      await expect(page).toHaveURL(/\/backend\/people\/persons\/create$/)
      await expect(page.getByText(locale === 'en' ? DENIED_EN : DENIED_PL)).toHaveCount(0)
    }
    const totalAfterForm = (await call<ListBody>(request, 'GET', '/api/people/persons?pageSize=1', club.adminToken))
      .body?.total
    expect(totalAfterForm).toBe(totalBeforeForm)

    // The person record renders the explanation as its own 403 state at 375 px, without the person's data.
    await page.setViewportSize({ width: 375, height: 812 })
    for (const [locale, message] of [
      ['pl', UNLINKED_PL],
      ['en', UNLINKED_EN],
    ] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: origin }])
      await page.goto(`/backend/people/persons/${existingId}`)
      await expect(page.getByText(message).first()).toBeVisible()
      await expect(page.getByText(marker)).toHaveCount(0)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
  } finally {
    await club.cleanup()
  }
})
