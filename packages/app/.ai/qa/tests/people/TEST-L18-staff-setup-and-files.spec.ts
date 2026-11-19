import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { familyFor } from '../_fixtures/attendance'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createPerson, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { SVG_AS_PNG, pdf, png, upload } from '../_fixtures/publication'

// People life-cycle spec phase L10 (#312; REQ-L09, REQ-L12, J-L07, AC-L10, AC-L13 in part): TEST-L18 — the "Staff
// setup" checklist on the Roles tab of B-10: a new person shows Account, Role, Groups as coach and Contract as not yet
// done, with the actions (create the account, assign the coach role, add to a group's roster as coach, add a contract
// with the person as the party); a person with an active account, the coach role, a coach membership and a coach
// contract shows all four done; a coordinator sees the states without the Account and Contract actions. The person's
// photo (PNG, JPEG or WebP up to 5 MB) and a contract's signed PDF (10 MB) are stored in the private `attachments`
// partition, read only through their scoped routes, replaced by a second upload and removed; an SVG renamed `.png`
// answers 422 `person_photo_format_unsupported`, an image as the contract 422 `contract_attachment_format_unsupported`.
// TEST-L20 — the photo and attachment routes fail closed for users without the features or outside the read scope.
test.describe.configure({ timeout: 420_000 })

const COACH_TERMS = { baseMonthly: 150000, unitRate: 8000, matchRate: 10000, travelRate: 5000 }

async function attachmentRow(club: Club, id: string | null) {
  if (!id) return null
  return withClient(async (client) => {
    const rows = await client.query<{ partition_code: string; entity_id: string; record_id: string }>(
      'select partition_code, entity_id, record_id from attachments where id = $1 and tenant_id = $2',
      [id, club.tenant.tenantId],
    )
    return rows.rows[0] ?? null
  })
}

async function pointer(club: Club, table: 'people_persons' | 'club_core_contracts', column: string, id: string) {
  return withClient(async (client) => {
    const rows = await client.query<{ value: string | null }>(
      `select ${column}::text as value from ${table} where id = $1 and tenant_id = $2`,
      [id, club.tenant.tenantId],
    )
    return rows.rows[0]?.value ?? null
  })
}

async function createCoachContract(request: APIRequestContext, club: Club, personId: string): Promise<string> {
  const created = await call<{ id?: string }>(request, 'POST', '/api/club_core/contracts', club.adminToken, {
    data: {
      partyType: 'person',
      partyId: personId,
      kind: 'coach',
      validFrom: calendarDate(-1),
      validTo: null,
      terms: COACH_TERMS,
    },
  })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return String(created.body?.id)
}

async function readFile(request: APIRequestContext, token: string, path: string) {
  const response = await request.fetch(path, { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
  return { status: response.status(), type: response.headers()['content-type'] ?? '', body: await response.body() }
}

test('TEST-L18 the person photo and the contract PDF are stored privately and read through their routes', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l18-files')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const coordinator = family.academyCoordinator

    // --- The photo: stored privately, read through its route, an SVG renamed .png refused ---
    const marek = await createPerson(request, admin, {
      firstName: 'Marek',
      lastName: 'Nowicki',
      birthDate: birthDateTurning(30),
    })
    const photoPath = `/api/people/persons/${marek}/photo`
    const fake = await upload(request, admin, photoPath, SVG_AS_PNG)
    expect(fake.status, JSON.stringify(fake.body)).toBe(422)
    expect(fake.body?.code).toBe('person_photo_format_unsupported')
    expect(await pointer(club, 'people_persons', 'photo_attachment_id', marek)).toBeNull()
    const byCoordinator = await upload(request, coordinator.token, photoPath, png([0, 128, 0]))
    expect(byCoordinator.status).toBe(403)
    const photo = await upload(request, admin, photoPath, png([0, 128, 0]))
    expect(photo.status, JSON.stringify(photo.body)).toBe(200)
    expect(photo.body?.hasPhoto).toBe(true)
    const photoId = await pointer(club, 'people_persons', 'photo_attachment_id', marek)
    expect(await attachmentRow(club, photoId)).toEqual({
      partition_code: 'privateAttachments',
      entity_id: 'people:person',
      record_id: marek,
    })
    const read = await readFile(request, admin, photoPath)
    expect(read.status).toBe(200)
    expect(read.type).toContain('image/png')
    expect(read.body.subarray(0, 4).toString('hex')).toBe('89504e47')
    // A coordinator's basic read has no photo; an unrelated guardian is outside the read scope.
    expect((await readFile(request, coordinator.token, photoPath)).status).toBe(403)
    expect((await readFile(request, family.guardian.token, photoPath)).status).toBe(403)
    const detail = await call<{ hasPhoto?: boolean }>(request, 'GET', `/api/people/persons/${marek}`, admin)
    expect(detail.body?.hasPhoto).toBe(true)
    const removedPhoto = await call<{ hasPhoto?: boolean }>(request, 'DELETE', photoPath, admin)
    expect(removedPhoto.status, JSON.stringify(removedPhoto.body)).toBe(200)
    expect(removedPhoto.body?.hasPhoto).toBe(false)
    expect((await readFile(request, admin, photoPath)).status).toBe(404)

    // --- The contract PDF: one file, a second upload replaces it, an image refused ---
    const marekContract = await createCoachContract(request, club, marek)
    const attachmentPath = `/api/club_core/contracts/${marekContract}/attachment`
    const image = await upload(request, admin, attachmentPath, png([0, 0, 128]))
    expect(image.status, JSON.stringify(image.body)).toBe(422)
    expect(image.body?.code).toBe('contract_attachment_format_unsupported')
    expect((await upload(request, coordinator.token, attachmentPath, pdf('umowa.pdf'))).status).toBe(403)
    const firstPdf = await upload(request, admin, attachmentPath, pdf('umowa.pdf'))
    expect(firstPdf.status, JSON.stringify(firstPdf.body)).toBe(200)
    const firstId = await pointer(club, 'club_core_contracts', 'attachment_id', marekContract)
    expect((await attachmentRow(club, firstId))?.partition_code).toBe('privateAttachments')
    const secondPdf = await upload(request, admin, attachmentPath, pdf('umowa-podpisana.pdf'))
    expect(secondPdf.status, JSON.stringify(secondPdf.body)).toBe(200)
    const secondId = await pointer(club, 'club_core_contracts', 'attachment_id', marekContract)
    expect(secondId).not.toBe(firstId)
    const pdfRead = await readFile(request, admin, attachmentPath)
    expect(pdfRead.status).toBe(200)
    expect(pdfRead.type).toContain('application/pdf')
    expect(pdfRead.body.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect((await readFile(request, coordinator.token, attachmentPath)).status).toBe(403)
    const listed = await call<{ items?: { id: string; hasAttachment?: boolean }[] }>(
      request,
      'GET',
      `/api/club_core/contracts?partyId=${marek}`,
      admin,
    )
    expect(listed.body?.items?.find((item) => item.id === marekContract)?.hasAttachment).toBe(true)
    const removedPdf = await call<{ hasAttachment?: boolean }>(request, 'DELETE', attachmentPath, admin)
    expect(removedPdf.status, JSON.stringify(removedPdf.body)).toBe(200)
    expect(removedPdf.body?.hasAttachment).toBe(false)
    expect((await readFile(request, admin, attachmentPath)).status).toBe(404)
  } finally {
    await club.cleanup()
  }
})

// The browser half: run in CI (the Cezar host cannot launch Chromium, lesson `cezar-host-integration-runs-without-browser`).
test('TEST-L18 the staff checklist turns done row by row; a coordinator has no Account or Contract action', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l18-checklist')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const coordinator = family.academyCoordinator
    // --- The checklist: a new person (nothing done) and a set-up coach (everything done) ---
    const newcomer = await createPerson(request, admin, {
      firstName: 'Tomasz',
      lastName: 'Nowy',
      birthDate: birthDateTurning(28),
    })
    const ready = await signedInStaff(request, club, { firstName: 'Ewa', lastName: 'Gotowa', role: 'coach' })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: ready.personId,
      role: 'coach',
      validFrom: calendarDate(-1),
    })
    await createCoachContract(request, club, ready.personId)

    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.goto(`/backend/people/persons/${newcomer}?tab=roles`)
    const checklist = page.getByTestId('people-staff-setup')
    await expect(checklist).toBeVisible()
    await expect(page.getByTestId('people-staff-setup-account')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('people-staff-setup-role')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('groups-staff-setup')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('club_core-staff-setup-contract')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('people-staff-setup-account-action')).toBeVisible()
    await expect(page.getByTestId('people-staff-setup-role-action')).toBeVisible()
    await expect(page.getByTestId('groups-staff-setup-add')).toBeVisible()
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-10 ?tab=roles staff setup',
      async () => {
        await expect(page.getByTestId('club_core-staff-setup-contract')).toHaveAttribute('data-step', 'missing')
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    // "Add a contract" opens the contract form with the person as the coach party.
    await page.getByTestId('club_core-staff-setup-contract-add').click()
    await expect(page).toHaveURL(new RegExp(`/backend/club/contracts/create\\?personId=${newcomer}`))
    await expect(page.getByText('Tomasz Nowy')).toBeVisible()
    // "Add to a group as coach" lands on the group's roster with the person and the coach role chosen.
    await page.goto(`/backend/groups/groups/${family.zaki}?tab=roster&personId=${newcomer}&role=coach`)
    await expect(page.getByTestId('groups-membership-dialog')).toBeVisible()
    await expect(page.getByTestId('groups-membership-person')).toContainText('Tomasz Nowy')

    await page.goto(`/backend/people/persons/${ready.personId}?tab=roles`)
    await expect(page.getByTestId('people-staff-setup-account')).toHaveAttribute('data-step', 'done')
    await expect(page.getByTestId('people-staff-setup-role')).toHaveAttribute('data-step', 'done')
    await expect(page.getByTestId('groups-staff-setup')).toHaveAttribute('data-step', 'done')
    await expect(page.getByTestId('club_core-staff-setup-contract')).toHaveAttribute('data-step', 'done')

    // A coordinator: the same states, without the Account and Contract actions (and without the Role action).
    await switchBrowserUser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/backend/people/persons/${newcomer}?tab=roles`)
    await expect(page.getByTestId('people-staff-setup-account')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('groups-staff-setup')).toHaveAttribute('data-step', 'missing')
    await expect(page.getByTestId('people-staff-setup-account-action')).toHaveCount(0)
    await expect(page.getByTestId('people-staff-setup-role-action')).toHaveCount(0)
    await expect(page.getByTestId('club_core-staff-setup-contract')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
