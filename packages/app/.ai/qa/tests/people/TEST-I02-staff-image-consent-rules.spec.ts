import { expect, test, type APIRequestContext } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getAuthToken } from '../_fixtures/auth'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  getPerson,
  signInAs,
  type Club,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe } from '../_fixtures/members'
import {
  actionLogEntries,
  createGuardianship,
  getGuardianship,
  setConsents,
  updateGuardianship,
} from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Event photos spec phase 1 (#871; REQ-I07, REQ-I08, AC-I02): TEST-I02 — staff never grant the image consent: the club
// administrator's grant through `set_consents`, `guardianships.update`, `guardianships.create` and an adult's own
// consents answers 422 `image_consent_subject_only`; a staff withdrawal needs a note (422 `consent_note_required`) and
// is recorded as `club_admin` with the note encrypted; a guardian changing the other guardian's row gets 403; the undo
// of a guardian's withdrawal keeps it withdrawn (BR-I06) and `imagePublishable` stays false; the administrator reads the
// history on B-10 and records a withdrawal through the dialog; a member reading another child's history gets 404.
test.describe.configure({ timeout: 420_000 })

type Ward = { personId: string; imagePublishable?: boolean; guardianship: { id: string; updatedAt: string | null } }

async function wardOf(request: APIRequestContext, token: string, wardId: string): Promise<Ward> {
  const me = await getMe(request, token)
  expect(me.status, JSON.stringify(me.body)).toBe(200)
  const ward = (me.body?.wards as Ward[] | undefined)?.find((candidate) => candidate.personId === wardId)
  expect(ward, JSON.stringify(me.body)).toBeTruthy()
  return ward as Ward
}

async function lockOf(request: APIRequestContext, token: string, guardianshipId: string): Promise<string> {
  return String((await getGuardianship(request, token, guardianshipId)).body?.updatedAt)
}

function withNote(request: APIRequestContext, token: string, id: string, note: string | undefined, lock: string) {
  return call<{ code?: string; updatedAt?: string }>(
    request,
    'POST',
    `/api/people/guardianships/${id}/consents`,
    token,
    {
      data: { consents: { image: false }, ...(note === undefined ? {} : { note }) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: lock },
    },
  )
}

async function staffEvents(club: Club, personId: string) {
  return withClient(async (client) => {
    const rows = await client.query<{ granted: boolean; note: string | null }>(
      `select granted, note from people_consent_events
        where tenant_id = $1 and subject_person_id = $2 and kind = 'image' and by_role = 'club_admin'`,
      [club.tenant.tenantId, personId],
    )
    return rows.rows
  })
}

test('TEST-I02 staff only record image withdrawals, one guardian cannot change the other row, undo keeps a withdrawal', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-i02')
  try {
    const admin = club.adminToken
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Zgoda',
      birthDate: birthDateTurning(37),
    })
    const tomek = await createStaff(request, club, {
      firstName: 'Tomek',
      lastName: 'Zgoda',
      birthDate: birthDateTurning(39),
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Zgoda',
      birthDate: birthDateTurning(10),
    })
    const kasiaRow = await createGuardianship(request, admin, {
      guardianPersonId: kasia.personId,
      wardPersonId: jas,
      isPrimaryPayer: true,
      validFrom: calendarDate(-10),
    })
    const tomekRow = await createGuardianship(request, admin, {
      guardianPersonId: tomek.personId,
      wardPersonId: jas,
      validFrom: calendarDate(-10),
    })

    // Staff grants answer 422 everywhere a consent is written.
    const bySetConsents = await setConsents(
      request,
      admin,
      tomekRow,
      { image: true },
      await lockOf(request, admin, tomekRow),
    )
    expect(bySetConsents.status, JSON.stringify(bySetConsents.body)).toBe(422)
    expect(bySetConsents.body?.code).toBe('image_consent_subject_only')
    const byUpdate = await updateGuardianship(
      request,
      admin,
      { id: tomekRow, consents: { image: true } },
      await lockOf(request, admin, tomekRow),
    )
    expect(byUpdate.status, JSON.stringify(byUpdate.body)).toBe(422)
    expect(byUpdate.body?.code).toBe('image_consent_subject_only')
    const other = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Zgoda',
      birthDate: birthDateTurning(8),
    })
    const byCreate = await call<{ code?: string }>(request, 'POST', '/api/people/guardianships', admin, {
      data: {
        guardianPersonId: kasia.personId,
        wardPersonId: other,
        validFrom: calendarDate(),
        consents: { image: true },
      },
    })
    expect(byCreate.status, JSON.stringify(byCreate.body)).toBe(422)
    expect(byCreate.body?.code).toBe('image_consent_subject_only')
    const adult = await createPerson(request, admin, {
      firstName: 'Beata',
      lastName: 'Zgoda',
      birthDate: birthDateTurning(30),
    })
    const byOwn = await call<{ code?: string }>(request, 'POST', `/api/people/persons/${adult}/consents`, admin, {
      data: { changes: { image: true } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((await getPerson(request, admin, adult)).body?.updatedAt) },
    })
    expect(byOwn.status, JSON.stringify(byOwn.body)).toBe(422)
    expect(byOwn.body?.code).toBe('image_consent_subject_only')

    // Kasia gives it on her row; she cannot touch Tomek's row (403).
    const kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const kasiaGives = await setConsents(
      request,
      kasiaToken,
      kasiaRow,
      { image: true },
      await lockOf(request, admin, kasiaRow),
    )
    expect(kasiaGives.status, JSON.stringify(kasiaGives.body)).toBe(200)
    expect((await wardOf(request, kasiaToken, jas)).imagePublishable).toBe(true)
    const onOtherRow = await setConsents(
      request,
      kasiaToken,
      tomekRow,
      { image: true },
      await lockOf(request, admin, tomekRow),
    )
    expect(onOtherRow.status, JSON.stringify(onOtherRow.body)).toBe(403)
    expect(onOtherRow.body?.code).toBe('scope_denied')

    // A staff withdrawal needs a note; with one it is recorded as staff, the note encrypted at rest.
    const noNote = await withNote(request, admin, kasiaRow, undefined, await lockOf(request, admin, kasiaRow))
    expect(noNote.status, JSON.stringify(noNote.body)).toBe(422)
    expect(noNote.body?.code).toBe('consent_note_required')
    const note = 'Mother asked by phone on Monday'
    const recorded = await withNote(request, admin, kasiaRow, note, await lockOf(request, admin, kasiaRow))
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(200)
    expect((await wardOf(request, kasiaToken, jas)).imagePublishable).toBe(false)
    const staffRows = await staffEvents(club, jas)
    expect(staffRows).toHaveLength(1)
    expect(staffRows[0]?.granted).toBe(false)
    expect(staffRows[0]?.note).toBeTruthy()
    expect(staffRows[0]?.note).not.toContain(note)

    // Kasia gives it again; Tomek gives and withdraws on his row: the veto holds.
    const regive = await setConsents(
      request,
      kasiaToken,
      kasiaRow,
      { image: true },
      await lockOf(request, admin, kasiaRow),
    )
    expect(regive.status, JSON.stringify(regive.body)).toBe(200)
    const tomekToken = await signInAs(request, club, tomek.userId, tomek.email)
    const tomekGives = await setConsents(
      request,
      tomekToken,
      tomekRow,
      { image: true },
      await lockOf(request, admin, tomekRow),
    )
    expect(tomekGives.status, JSON.stringify(tomekGives.body)).toBe(200)
    const tomekWithdraws = await setConsents(
      request,
      tomekToken,
      tomekRow,
      { image: false },
      tomekGives.body?.updatedAt,
    )
    expect(tomekWithdraws.status, JSON.stringify(tomekWithdraws.body)).toBe(200)
    expect((await wardOf(request, kasiaToken, jas)).imagePublishable).toBe(false)

    // The administrator undoes Tomek's withdrawal: the image consent stays withdrawn (BR-I06).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant', 'audit_logs.undo_tenant'],
    })
    const withdrawal = (await actionLogEntries(request, admin, tomekRow)).find(
      (entry) => entry.commandId === 'people.guardianships.set_consents' && entry.undoToken,
    )
    expect(withdrawal?.undoToken, 'the undo token of the withdrawal').toBeTruthy()
    const undone = await undoByToken(request, admin, String(withdrawal?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const tomekRowAfter = await getGuardianship(request, admin, tomekRow)
    expect(tomekRowAfter.body?.consents?.image.granted).toBe(false)
    expect((await wardOf(request, kasiaToken, jas)).imagePublishable).toBe(false)

    // The administrator's history read; a member reading another family's child gets 404.
    const history = await call<{ items: { granted: boolean; byRole: string }[]; total: number }>(
      request,
      'GET',
      `/api/people/persons/${jas}/consents/image-history`,
      admin,
    )
    expect(history.status, JSON.stringify(history.body)).toBe(200)
    expect(history.body?.items.map((item) => [item.granted, item.byRole])).toEqual([
      [false, 'guardian'],
      [true, 'guardian'],
      [true, 'guardian'],
      [false, 'club_admin'],
      [true, 'guardian'],
    ])
    const stranger = await call(request, 'GET', `/api/people/me/consents/${other}/image-history`, kasiaToken)
    expect(stranger.status).toBe(404)
    const staffRead = await call(request, 'GET', `/api/people/persons/${jas}/consents/image-history`, kasiaToken)
    expect([403, 404]).toContain(staffRead.status)

    // B-10: no image grant for staff; "Record withdrawal" with a note withdraws Kasia's grant.
    // `signInBrowser` ends the administrator's API tokens: take a fresh one (lesson `sign-in-browser-ends-the-api-token`).
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const freshAdmin = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto(`/backend/people/persons/${jas}`)
    await page.getByRole('tab', { name: uiText('people.persons.tabs.guardianship') }).click()
    const kasiaItem = page.locator(`[data-guardianship-id="${kasiaRow}"]`)
    await expect(kasiaItem.getByTestId('people-image-consent-staff')).toContainText(
      uiText('people.consents.image.staff.onlyGuardian'),
    )
    await kasiaItem.getByTestId('people-image-withdraw').click()
    const dialog = page.getByTestId('people-image-withdraw-dialog')
    await expect(dialog.getByTestId('people-image-withdraw-submit')).toBeDisabled()
    await dialog.locator('#people-image-withdraw-note').fill('Father asked in writing')
    await dialog.getByTestId('people-image-withdraw-submit').click()
    await expect(page.getByText(uiText('people.consents.image.staff.flash.withdrawn')).first()).toBeVisible()
    await expect
      .poll(async () => (await getGuardianship(request, freshAdmin, kasiaRow)).body?.consents?.image.granted)
      .toBe(false)
    await kasiaItem.getByTestId('people-image-history').click()
    await expect(page.getByTestId('people-image-history-dialog').getByTestId('people-image-history-item')).toHaveCount(
      6,
    )
  } finally {
    await club.cleanup()
  }
})
