import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture, setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
  createStaff,
  getPerson,
  mercato,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { cancelCharge, getCharge, recordPayment } from '../_fixtures/payments'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// People life-cycle spec phase L6 (#308; REQ-L05, J-L04, AC-L06): TEST-L07 — a former person with a payment this year
// and an open charge: anonymising without a recorded request and with the open charge answers 409 with the reasons
// (the charge named), a wrong last name 422; then contact and identity fields are null at once, the name stays with
// the hold date (31 December five years on) for the administrator only, a coordinator reads "Former member", a name
// search finds nothing, an undo of an earlier edit and a return are refused (409 `person_anonymized`), a second
// anonymisation too, and another organization's person is untouched; the daily job run after the hold clears the
// name. A former person without payments loses the name at once (`erasureHoldUntil` null) — done in the browser
// through the Leaving tab (typed confirmation, wrong name first). TEST-L08 — a person without history is deleted (204)
// and the undo restores them; a person with a charge or a guardianship answers 409 `person_in_use` with the reasons.
// TEST-L20 — both routes fail closed for another organization, and a user with `people.manage` but without
// `people.persons.anonymize` gets 403 on the anonymisation.
test.describe.configure({ timeout: 420_000 })

type Reason = { code: string; module?: string; recordId?: string }
type AnonymizeBody = { code?: string; reasons?: Reason[]; anonymizedAt?: string; erasureHoldUntil?: string | null }

/** The person's version as the administrator reads it (the lock token both routes require). */
async function versionOf(request: APIRequestContext, token: string, personId: string): Promise<string> {
  const read = await getPerson(request, token, personId)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return String((read.body as { updatedAt?: string }).updatedAt)
}

/** `versionToken` reads the version (the administrator's when the caller may not read the person). */
async function anonymize(
  request: APIRequestContext,
  token: string,
  personId: string,
  data: Record<string, unknown>,
  versionToken = token,
) {
  const lock = await versionOf(request, versionToken, personId)
  return call<AnonymizeBody>(request, 'POST', `/api/people/persons/${personId}/anonymize`, token, {
    data,
    headers: { [OPTIMISTIC_LOCK_HEADER]: lock },
  })
}

async function deletePerson(request: APIRequestContext, token: string, personId: string, versionToken = token) {
  const lock = await versionOf(request, versionToken, personId)
  return call<{ code?: string; reasons?: Reason[] }>(request, 'DELETE', `/api/people/persons/${personId}`, token, {
    headers: { [OPTIMISTIC_LOCK_HEADER]: lock },
  })
}

/** Departs the persons today (they are former at once) through the preview and the confirm. */
async function departToday(request: APIRequestContext, token: string, personIds: string[]): Promise<void> {
  const lastDay = calendarDate()
  const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', token, {
    data: { personIds, lastDay },
  })
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  const confirmed = await call(request, 'POST', '/api/people/departures', token, {
    data: { personIds, lastDay, previewToken: preview.body?.previewToken },
  })
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
}

async function recordErasureRequest(request: APIRequestContext, token: string, personId: string): Promise<string> {
  const recorded = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', token, {
    data: { subjectPersonId: personId, requesterKind: 'self', erasure: true, note: 'Letter of 2 November' },
  })
  expect(recorded.status, JSON.stringify(recorded.body)).toBe(201)
  return String(recorded.body?.id)
}

async function addCharge(request: APIRequestContext, token: string, personId: string, amount: number) {
  const created = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', token, {
    data: { personId, description: 'Składka', amount, dueDate: calendarDate(7) },
  })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return String(created.body?.chargeId)
}

type PersonRow = {
  first_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  birth_date: string | null
  external_id: string | null
  preferred_locale: string | null
  anonymized_at: string | null
  erasure_hold_until: string | null
}

async function personRow(club: Club, personId: string): Promise<PersonRow> {
  return withClient(async (client) => {
    const rows = await client.query<PersonRow>(
      `select first_name, email, phone, notes, birth_date::text, external_id, preferred_locale,
              anonymized_at::text, to_char(erasure_hold_until, 'YYYY-MM-DD') as erasure_hold_until
         from people_persons where tenant_id = $1 and id = $2`,
      [club.tenant.tenantId, personId],
    )
    return rows.rows[0]
  })
}

async function listIds(request: APIRequestContext, token: string, query: string): Promise<string[]> {
  const result = await call<{ items?: { id: string }[] }>(
    request,
    'GET',
    `/api/people/persons?pageSize=100${query}`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return (result.body?.items ?? []).map((item) => item.id)
}

const FORMER_MEMBER = [uiTextIn('en', 'people.person.formerMember'), uiTextIn('pl', 'people.person.formerMember')]

test('TEST-L07 anonymising a former person: refusals, the retention hold, Former member, the job', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-l07-anonymise')
  try {
    const admin = club.adminToken
    const suffix = uniqueSuffix()
      .replace(/[^a-z]/gi, '')
      .slice(0, 6)
    const lastName = `Zawadzka${suffix}`
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName,
      birthDate: birthDateTurning(34),
      email: `kasia-${suffix}@example.org`,
      phone: '+48600100200',
      notes: 'Prefers e-mail',
      externalId: `EXT-${suffix}`,
    })
    const control = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName,
      birthDate: birthDateTurning(40),
    })
    const second = await createSecondOrganization(request, club)
    const other = await createPerson(request, second.adminToken, {
      firstName: 'Kasia',
      lastName,
      birthDate: birthDateTurning(34),
      email: `other-${suffix}@example.org`,
    })

    // A paid charge this year (the hold) and an open one (a blocker); an edit before the erasure (its undo comes later).
    const paidCharge = await addCharge(request, admin, kasia, 12_000)
    const paid = await recordPayment(
      request,
      admin,
      paidCharge,
      (await getCharge(request, admin, paidCharge)).updatedAt,
      {
        amount: 12_000,
        method: 'transfer',
        paidOn: calendarDate(),
      },
    )
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    const openCharge = await addCharge(request, admin, kasia, 5_000)
    const before = await getPerson(request, admin, kasia)
    const edited = await call(request, 'PUT', '/api/people/persons', admin, {
      data: { id: kasia, phone: '+48600100300' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((before.body as { updatedAt?: string }).updatedAt) },
    })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)

    // Not former yet, no request, an open charge: 409 with every reason.
    const early = await anonymize(request, admin, kasia, { requestId: kasia, confirmLastName: lastName })
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('anonymize_blocked')
    expect(early.body?.reasons?.map((reason) => reason.code)).toEqual(['not_left', 'open_charges', 'request_missing'])
    expect(early.body?.reasons?.find((reason) => reason.code === 'open_charges')?.recordId).toBe(openCharge)

    await departToday(request, admin, [kasia])
    const requestId = await recordErasureRequest(request, admin, kasia)
    const blocked = await anonymize(request, admin, kasia, { requestId, confirmLastName: lastName })
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(409)
    expect(blocked.body?.reasons?.map((reason) => reason.code)).toEqual(['open_charges'])
    const cancelled = await cancelCharge(
      request,
      admin,
      openCharge,
      (await getCharge(request, admin, openCharge)).updatedAt,
      {
        reason: 'Issued by mistake',
      },
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)

    // A wrong last name: 422, nothing erased.
    const mismatch = await anonymize(request, admin, kasia, { requestId, confirmLastName: 'Kowalska' })
    expect(mismatch.status, JSON.stringify(mismatch.body)).toBe(422)
    expect(mismatch.body?.code).toBe('confirmation_mismatch')
    expect((await personRow(club, kasia)).email).not.toBeNull()

    // Anonymised: contact and identity data null at once, the name kept until 31 December five years on.
    const holdUntil = `${String(Number(calendarDate().slice(0, 4)) + 5)}-12-31`
    const done = await anonymize(request, admin, kasia, { requestId, confirmLastName: ` ${lastName.toUpperCase()} ` })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body?.erasureHoldUntil).toBe(holdUntil)
    const row = await personRow(club, kasia)
    expect(row).toMatchObject({
      email: null,
      phone: null,
      notes: null,
      birth_date: null,
      external_id: null,
      preferred_locale: null,
      erasure_hold_until: holdUntil,
    })
    expect(row.anonymized_at).not.toBeNull()
    expect(row.first_name).not.toBeNull()
    const forAdmin = (await getPerson(request, admin, kasia)).body as Record<string, unknown>
    expect(forAdmin).toMatchObject({ firstName: 'Kasia', lastName, erasureHoldUntil: holdUntil, email: null })
    expect(forAdmin.anonymizedAt).toBeTruthy()

    // A coordinator (basic read, without people.manage) reads "Former member" and no hold date.
    const section = await create(request, admin, 'sections', { name: `Sekcja ${suffix}` })
    const coordinator = await createStaff(request, club, {
      firstName: 'Olga',
      lastName: 'Koordynator',
      birthDate: birthDateTurning(41),
    })
    await assignRole(request, admin, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: section,
      validFrom: calendarDate(-1),
    })
    const coordinatorToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    const forCoordinator = (await getPerson(request, coordinatorToken, kasia)).body as Record<string, unknown>
    expect(FORMER_MEMBER).toContain(forCoordinator.firstName)
    expect(forCoordinator.lastName).toBe('')
    expect(forCoordinator).not.toHaveProperty('erasureHoldUntil')

    // A name search finds the control person only; the Former list still has the anonymised person.
    const found = await listIds(request, admin, `&search=${encodeURIComponent(lastName)}`)
    expect(found).toContain(control)
    expect(found).not.toContain(kasia)
    expect(await listIds(request, admin, '&view=former')).toContain(kasia)

    // Nothing brings the data back: the undo of the earlier edit, a return, a second anonymisation.
    const update = (await actionLogEntries(request, admin, kasia)).find(
      (entry) => entry.commandId === 'people.persons.update',
    )
    expect(update?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(update?.undoToken))
    // Refused either by the platform (a later action superseded the token, 400) or by `person_anonymized` (409).
    expect([400, 409], await undone.text()).toContain(undone.status())
    expect((await personRow(club, kasia)).phone).toBeNull()
    const returned = await call<{ code?: string }>(request, 'POST', `/api/people/persons/${kasia}/return`, admin)
    expect(returned.status).toBe(409)
    expect(returned.body?.code).toBe('person_anonymized')
    const again = await anonymize(request, admin, kasia, { requestId, confirmLastName: lastName })
    expect(again.status).toBe(409)
    expect(again.body?.reasons?.map((reason) => reason.code)).toEqual(['already_anonymized'])
    const anonymizeLog = (await actionLogEntries(request, admin, kasia)).find(
      (entry) => entry.commandId === 'people.persons.anonymize',
    )
    expect(anonymizeLog?.undoToken ?? null).toBeNull()

    // The other organization's person is untouched.
    const otherView = (await getPerson(request, second.adminToken, other)).body as Record<string, unknown>
    expect(otherView).toMatchObject({ firstName: 'Kasia', lastName, email: `other-${suffix}@example.org` })
    expect(otherView.anonymizedAt ?? null).toBeNull()

    // The daily job of the day after the hold clears the name (step 5) once.
    const job = mercato([
      'people',
      'life-cycle',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
      '--today',
      `${String(Number(holdUntil.slice(0, 4)) + 1)}-01-01`,
    ]) as { steps: string[]; counts: { namesErased: number } }
    expect(job.steps).toContain('erasure_names')
    expect(job.counts.namesErased).toBe(1)
    // The name columns are encrypted, so the cleared name is checked through the read.
    expect((await personRow(club, kasia)).erasure_hold_until).toBeNull()
    const cleared = (await getPerson(request, admin, kasia)).body as { firstName?: string; lastName?: string }
    expect(FORMER_MEMBER).toContain(cleared.firstName)
    expect(cleared.lastName).toBe('')

    // A former person without payments, anonymised in the browser: the name goes at once.
    const jan = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: `Wiśniewski${suffix}`,
      birthDate: birthDateTurning(29),
      email: `jan-${suffix}@example.org`,
    })
    await departToday(request, admin, [jan])
    await recordErasureRequest(request, admin, jan)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.goto(`/backend/people/persons/${jan}?tab=leaving`)
    await page.getByTestId('people-erasure-anonymise').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(uiText('people.erasure.anonymise.irreversible'))
    await dialog.locator('#people-erasure-last-name').fill('Kowalski')
    await dialog.getByTestId('people-erasure-anonymise-confirm').click()
    await expect(dialog).toContainText(uiText('people.errors.confirmation_mismatch'))
    await dialog.locator('#people-erasure-last-name').fill(`Wiśniewski${suffix}`)
    await dialog.getByTestId('people-erasure-anonymise-confirm').click()
    await expect(page.getByTestId('people-erasure-anonymised')).toBeVisible()
    await expect(page.getByTestId('people-erasure-hold')).toContainText(uiText('people.erasure.nameErased'))
    expect(await personRow(club, jan)).toMatchObject({ email: null, erasure_hold_until: null })
    expect(FORMER_MEMBER).toContain((await page.locator('h1').first().innerText()).trim())
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-10 ?tab=leaving anonymised',
      async () => {
        await expect(page.getByTestId('people-erasure-anonymised')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})

test('TEST-L08 a person created by mistake is deleted and the undo restores them; history answers 409', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l08-delete')
  try {
    const admin = club.adminToken
    const mistake = await createPerson(request, admin, {
      firstName: 'Pomyłka',
      lastName: 'Duplikat',
      birthDate: birthDateTurning(25),
    })
    const deleted = await deletePerson(request, admin, mistake)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204)
    expect((await getPerson(request, admin, mistake)).status).toBe(404)
    const log = (await actionLogEntries(request, admin, mistake)).find(
      (entry) => entry.commandId === 'people.persons.delete',
    )
    expect(log?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    expect((await getPerson(request, admin, mistake)).status).toBe(200)

    // A charge (the payments history) and a guardianship (people's own) keep a person.
    const charged = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Opłacony',
      birthDate: birthDateTurning(31),
    })
    await addCharge(request, admin, charged, 3_000)
    const inUse = await deletePerson(request, admin, charged)
    expect(inUse.status, JSON.stringify(inUse.body)).toBe(409)
    expect(inUse.body?.code).toBe('person_in_use')
    expect(inUse.body?.reasons).toEqual([{ code: 'history', module: 'payments' }])
    const guardian = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Opiekun',
      birthDate: birthDateTurning(40),
    })
    const ward = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Opiekun',
      birthDate: birthDateTurning(8),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: guardian,
      wardPersonId: ward,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-10),
    })
    const withWard = await deletePerson(request, admin, guardian)
    expect(withWard.status).toBe(409)
    expect(withWard.body?.reasons?.map((reason) => reason.code)).toEqual(['guardianships'])
    expect((await getPerson(request, admin, guardian)).status).toBe(200)
  } finally {
    await club.cleanup()
  }
})

test('TEST-L20 the anonymise and delete routes fail closed (#308)', async ({ request }) => {
  const club = await createClub(request, 'test-l20-erasure')
  try {
    const admin = club.adminToken
    const person = await createPerson(request, admin, {
      firstName: 'Zofia',
      lastName: 'Obca',
      birthDate: birthDateTurning(30),
    })

    // Another organization's administrator: outside the caller's organization (403 or 404); nothing changes.
    const second = await createSecondOrganization(request, club)
    const foreign = await anonymize(
      request,
      second.adminToken,
      person,
      { requestId: person, confirmLastName: 'Obca' },
      admin,
    )
    expect([403, 404]).toContain(foreign.status)
    const foreignDelete = await deletePerson(request, second.adminToken, person, admin)
    expect([403, 404]).toContain(foreignDelete.status)

    // A user with people.manage but without people.persons.anonymize: 403 on the anonymisation.
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'people.view', 'people.manage'],
    })
    const email = `manager-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const userId = await createUserFixture(request, club.superToken, {
      email,
      password,
      organizationId: club.tenant.organizationId,
      roles: [club.tenant.roleId],
    })
    club.extraUserIds.unshift(userId)
    const manager = await getAuthToken(request, email, password)
    const refused = await anonymize(request, manager, person, { requestId: person, confirmLastName: 'Obca' }, admin)
    expect(refused.status).toBe(403)
    expect((await getPerson(request, admin, person)).status).toBe(200)
    expect(
      ((await getPerson(request, admin, person)).body as { anonymizedAt?: string | null }).anonymizedAt ?? null,
    ).toBeNull()
  } finally {
    await club.cleanup()
  }
})
