import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  actionLogs,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  signInAs,
  type Club,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, getGroup, roster, updateGroup } from '../_fixtures/groups'
import {
  PESEL_BAD_DATE_CHILD,
  PESEL_EXISTING_CHILD,
  PESEL_NEW_CHILD,
  PESEL_RENAMED_CHILD,
  byRowNo,
  csvFile,
  familiesCsv,
  getImport,
  importAction,
  importRows,
  previewImport,
  purgeImports,
  rawImportRows,
  type ImportRowView,
  type ImportView,
  type SheetCell,
} from '../_fixtures/imports'
import { setUserFeatures } from '../_fixtures/members'

// E03-S06 (issue #65; club spec REQ-036, AC-036, DD-38, D-026, phase 2 step 2, TEST-051 membership part): with `groups`
// enabled, its `groups.membershipImporter` hook turns the import's group column into participant memberships — a name
// matches exactly one live, active group of the club (trimmed, case-insensitive); none or several leave the row
// waiting with the reason, shown already in the preview; the commit creates each membership once (an existing one is
// not duplicated); re-running the commit processes only the waiting rows, also rows committed before the hook
// (`groups_not_enabled`); the purge keeps waiting rows and deletes processed ones; a group of another tenant with the
// same name is never used; the re-run needs `people.pesel.view`; the detail page passes axe in light and dark at 375 px.
test.describe.configure({ timeout: 300_000 })

/** A sheet row: the child with a PESEL and the group, no guardian (`FAMILY_HEADER`). */
function sheetRow(first: string, last: string, birthDate: string, pesel: string, group: string | null): SheetCell[] {
  return [first, last, birthDate, pesel, null, null, null, null, group]
}

// Synthetic numbers with valid check digits (engineering standards S5.9).
const PESEL_NO_GROUP_CHILD = '14230312347'
const PESEL_INACTIVE_GROUP_CHILD = '13240412348'

function row(rows: readonly ImportRowView[], rowNo: number): ImportRowView {
  const found = byRowNo(rows).get(rowNo)
  if (!found) throw new Error(`[internal] row ${String(rowNo)} missing`)
  return found
}

async function current(request: Parameters<typeof getImport>[0], token: string, id: string): Promise<ImportView> {
  const result = await getImport(request, token, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as ImportView
}

/** Re-runs (or runs) the commit with the import's current lock token. */
async function commit(request: Parameters<typeof getImport>[0], token: string, id: string) {
  return importAction(request, token, id, 'commit', (await current(request, token, id)).updatedAt)
}

async function personIdByName(request: Parameters<typeof call>[0], token: string, first: string, last: string) {
  const result = await call<{ items?: { id: string; firstName: string }[] }>(
    request,
    'GET',
    `/api/people/persons?pageSize=100&lastName=${encodeURIComponent(last)}`,
    token,
  )
  const id = (result.body?.items ?? []).find((item) => item.firstName === first)?.id
  expect(id, `${first} ${last}`).toBeTruthy()
  return String(id)
}

/** The club's sections and groups: "Orliki U8", "Żaki" in two sections (ambiguous) and an inactive "Skrzaty". */
async function seedGroups(request: Parameters<typeof call>[0], club: Club) {
  const token = club.adminToken
  const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
  const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
  const orliki = await createGroup(request, token, { sectionId: academy, name: 'Orliki U8', kind: 'team' })
  const zakiAcademy = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team' })
  const zakiPool = await createGroup(request, token, { sectionId: pool, name: 'żaki', kind: 'class_group' })
  const skrzaty = await createGroup(request, token, {
    sectionId: academy,
    name: 'Skrzaty',
    kind: 'team',
    isActive: false,
  })
  return { academy, pool, orliki, zakiAcademy, zakiPool, skrzaty }
}

test('E03-S06 the commit creates memberships once, unknown and ambiguous groups wait with their reason, the re-run processes only waiting rows', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s06-commit')
  const otherClub = await createClub(request, 'e03-s06-other')
  try {
    const token = club.adminToken
    const groups = await seedGroups(request, club)
    // Another tenant has groups with the names that do not resolve here: they are never used.
    const otherSection = await createStructure(request, otherClub.adminToken, 'sections', { name: 'Akademia' })
    const otherNieznana = await createGroup(request, otherClub.adminToken, {
      sectionId: otherSection,
      name: 'Nieznana',
      kind: 'team',
    })
    // Zofia is already a participant of "Orliki U8".
    const zofia = await createPerson(request, token, {
      firstName: 'Zofia',
      lastName: 'Kowalska',
      birthDate: '2015-06-12',
      pesel: PESEL_EXISTING_CHILD,
    })
    const existing = await addMembership(request, token, {
      groupId: groups.orliki,
      personId: zofia,
      role: 'participant',
      validFrom: '2026-01-01',
    })

    const sheet = familiesCsv([
      sheetRow('Ola', 'Nowa', '2016-05-01', PESEL_NEW_CHILD, '  orliki u8 '),
      sheetRow('Zofia', 'Kowalska', '2015-06-12', PESEL_EXISTING_CHILD, 'Orliki U8'),
      sheetRow('Tomasz', 'Nowak', '2010-11-01', PESEL_RENAMED_CHILD, 'ŻAKI'),
      sheetRow('Piotr', 'Zielony', '1988-07-05', PESEL_BAD_DATE_CHILD, 'Nieznana'),
      sheetRow('Adam', 'Bezgrupy', '2014-03-03', PESEL_NO_GROUP_CHILD, null),
      sheetRow('Ewa', 'Skrzat', '2013-04-04', PESEL_INACTIVE_GROUP_CHILD, 'Skrzaty'),
    ])

    // The preview shows what becomes of each group before anything is written.
    const preview = await previewImport(request, token, csvFile(sheet))
    let rows = await importRows(request, token, preview.id)
    expect(
      rows.map((item) => [item.rowNo, item.classification, item.membershipPreview, item.membershipStatus]),
    ).toEqual([
      [2, 'new', 'group_found', null],
      [3, 'matched', 'group_found', null],
      [4, 'new', 'group_ambiguous', null],
      [5, 'new', 'group_not_found', null],
      [6, 'new', null, null],
      // An inactive group is not matched.
      [7, 'new', 'group_not_found', null],
    ])
    expect(preview.canCreateMemberships).toBe(false)

    // The commit is not blocked: the persons are written, the resolved memberships created, the others wait.
    const committed = await commit(request, token, preview.id)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body).toMatchObject({
      status: 'committed',
      canCreateMemberships: true,
      summary: { created: 5, membershipsCreated: 1, membershipsExisting: 1, membershipsPending: 3 },
    })
    rows = await importRows(request, token, preview.id)
    expect(rows.map((item) => [item.rowNo, item.membershipStatus, item.membershipPreview])).toEqual([
      [2, 'membership_created', null],
      [3, 'membership_existed', null],
      [4, 'group_ambiguous', null],
      [5, 'group_not_found', null],
      [6, null, null],
      [7, 'group_not_found', null],
    ])
    const ola = await personIdByName(request, token, 'Ola', 'Nowa')
    const orlikiRoster = (await roster(request, token, groups.orliki)).items
    expect(orlikiRoster).toHaveLength(2)
    expect(orlikiRoster.find((item) => item.personId === zofia)?.id).toBe(existing)
    expect(orlikiRoster.find((item) => item.personId === ola)).toMatchObject({
      role: 'participant',
      validFrom: calendarDate(),
      validTo: null,
    })
    for (const groupId of [groups.zakiAcademy, groups.zakiPool]) {
      expect((await roster(request, token, groupId)).items).toEqual([])
    }
    expect((await roster(request, otherClub.adminToken, otherNieznana)).items).toEqual([])
    // Audited: the commit names the membership, which has its own entry written by the administrator.
    const commitEntry = (await actionLogs(request, token, preview.id)).find(
      (entry) => entry.commandId === 'people.imports.commit',
    )
    const olaMembership = String(orlikiRoster.find((item) => item.personId === ola)?.id)
    expect(commitEntry?.context?.membershipIds).toEqual([olaMembership])
    const membershipEntry = (await actionLogs(request, token, olaMembership)).find(
      (entry) => entry.commandId === 'groups.memberships.create',
    )
    expect(membershipEntry?.context).toMatchObject({ actingRole: 'club_admin' })

    // A re-run while nothing changed writes nothing.
    const idle = await commit(request, token, preview.id)
    expect(idle.status, JSON.stringify(idle.body)).toBe(200)
    expect(idle.body?.summary).toMatchObject({ membershipsCreated: 1, membershipsExisting: 1, membershipsPending: 3 })
    expect((await roster(request, token, groups.orliki)).items).toHaveLength(2)

    // The re-run needs `people.pesel.view` like every import route: 403, and nothing is written.
    const clerk = await createStaff(request, club, {
      firstName: 'Clerk',
      lastName: 'Bezpesel',
      birthDate: birthDateTurning(30),
    })
    await setUserFeatures(request, club, clerk.userId, ['people.view', 'people.manage', 'groups.view', 'groups.manage'])
    const clerkToken = await signInAs(request, club, clerk.userId, clerk.email)
    const denied = await importAction(request, clerkToken, preview.id, 'commit', idle.body?.updatedAt ?? null)
    expect(denied.status).toBe(403)

    // The pool group is renamed: "Żaki" now names one group, and the re-run creates Tomasz's membership only.
    const pool = await getGroup(request, token, groups.zakiPool)
    const renamed = await updateGroup(request, token, { id: groups.zakiPool, name: 'Żaki basen' }, pool.body?.updatedAt)
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const second = await commit(request, token, preview.id)
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    expect(second.body?.summary).toMatchObject({ membershipsCreated: 2, membershipsExisting: 1, membershipsPending: 2 })
    const tomasz = await personIdByName(request, token, 'Tomasz', 'Nowak')
    expect((await roster(request, token, groups.zakiAcademy)).items.map((item) => item.personId)).toEqual([tomasz])
    expect(row(await importRows(request, token, preview.id), 5).membershipStatus).toBe('group_not_found')

    // Once "Nieznana" exists here and "Skrzaty" is active again, the last rows are processed; a further commit is 409
    // as before.
    await createGroup(request, token, { sectionId: groups.academy, name: 'Nieznana', kind: 'team' })
    const skrzaty = await getGroup(request, token, groups.skrzaty)
    const activated = await updateGroup(request, token, { id: groups.skrzaty, isActive: true }, skrzaty.body?.updatedAt)
    expect(activated.status, JSON.stringify(activated.body)).toBe(200)
    const third = await commit(request, token, preview.id)
    expect(third.status, JSON.stringify(third.body)).toBe(200)
    expect(third.body).toMatchObject({
      canCreateMemberships: false,
      summary: { membershipsCreated: 4, membershipsPending: 0 },
    })
    const done = await commit(request, token, preview.id)
    expect(done.status).toBe(409)
    expect(done.body?.code).toBe('import_already_committed')
    // The other tenant's group is still empty.
    expect((await roster(request, otherClub.adminToken, otherNieznana)).items).toEqual([])
  } finally {
    await otherClub.cleanup()
    await club.cleanup()
  }
})

test('E03-S06 rows committed before the hook get their memberships on re-run; the purge keeps waiting rows and deletes processed ones', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s06-rerun')
  try {
    const token = club.adminToken
    const preview = await previewImport(
      request,
      token,
      csvFile(
        familiesCsv([
          sheetRow('Ola', 'Nowa', '2016-05-01', PESEL_NEW_CHILD, 'Orliki U8'),
          sheetRow('Zofia', 'Kowalska', '2015-06-12', PESEL_EXISTING_CHILD, 'Brak'),
        ]),
      ),
    )
    const committed = await commit(request, token, preview.id)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body?.summary).toMatchObject({ membershipsPending: 2 })
    // Simulate rows committed before `groups` registered its hook (#28).
    await withClient(async (client) => {
      await client.query(
        "update people_import_rows set membership_status = 'groups_not_enabled' where import_id = $1 and membership_status is not null",
        [preview.id],
      )
    })
    expect((await rawImportRows(preview.id)).map((item) => item.membership_status)).toEqual([
      'groups_not_enabled',
      'groups_not_enabled',
    ])

    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const orliki = await createGroup(request, token, { sectionId: academy, name: 'Orliki U8', kind: 'team' })
    const rerun = await commit(request, token, preview.id)
    expect(rerun.status, JSON.stringify(rerun.body)).toBe(200)
    expect(rerun.body?.summary).toMatchObject({ created: 2, membershipsCreated: 1, membershipsPending: 1 })
    const ola = await personIdByName(request, token, 'Ola', 'Nowa')
    expect((await roster(request, token, orliki)).items.map((item) => item.personId)).toEqual([ola])
    expect((await rawImportRows(preview.id)).map((item) => item.membership_status)).toEqual([
      'membership_created',
      'group_not_found',
    ])

    // The purge after 30 days: the processed row goes, the waiting one keeps its ids and group label only.
    const committedAt = new Date(String(committed.body?.committedAt)).getTime()
    const purge = purgeImports(club.tenant, new Date(committedAt + 31 * 86_400_000).toISOString())
    expect(purge.counts).toMatchObject({ imports: 1, rows: 1, failed: 0 })
    expect(await rawImportRows(preview.id)).toEqual([{ row_no: 3, raw: null, membership_status: 'group_not_found' }])

    // The waiting row of the purged import is processed by a re-run, and the next purge deletes it.
    await createGroup(request, token, { sectionId: academy, name: 'Brak', kind: 'team' })
    const late = await commit(request, token, preview.id)
    expect(late.status, JSON.stringify(late.body)).toBe(200)
    expect(late.body?.summary).toMatchObject({ membershipsCreated: 2, membershipsPending: 0 })
    expect((await rawImportRows(preview.id)).map((item) => item.membership_status)).toEqual(['membership_created'])
    const sweep = purgeImports(club.tenant, new Date(committedAt + 32 * 86_400_000).toISOString())
    expect(sweep.counts).toMatchObject({ imports: 0, rows: 1, failed: 0 })
    expect(await rawImportRows(preview.id)).toEqual([])
  } finally {
    await club.cleanup()
  }
})

test('E03-S06 import detail page: membership outcome per row and "Create memberships"; axe in light and dark at 375 px', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e03-s06-page')
  try {
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    const token = club.adminToken
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    await createGroup(request, token, { sectionId: academy, name: 'Orliki U8', kind: 'team' })
    const preview = await previewImport(
      request,
      token,
      csvFile(
        familiesCsv([
          sheetRow('Ola', 'Nowa', '2016-05-01', PESEL_NEW_CHILD, 'Orliki U8'),
          sheetRow('Zofia', 'Kowalska', '2015-06-12', PESEL_EXISTING_CHILD, 'Brak'),
        ]),
      ),
    )
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const ready = () => expect(page.getByTestId('people-import-status')).toBeVisible()

    // The preview: the found group and the missing one.
    await page.goto(`/backend/people/imports/${preview.id}`)
    await ready()
    await expect(page.getByTestId('people-import-row-2-membership')).toContainText(/Group found|Grupa znaleziona/)
    await expect(page.getByTestId('people-import-row-3-membership')).toContainText(
      /No group with this name|Brak grupy o tej nazwie/,
    )
    Object.assign(violations, await scanInColorSchemes(page, testInfo, 'preview', ready, { platformBaseline: true }))

    // Committed: one membership created, one waiting; "Create memberships" re-runs the commit.
    const committed = await commit(request, token, preview.id)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    await page.reload()
    await ready()
    await expect(page.getByTestId('people-import-row-2-membership')).toContainText(/Added to the group|Dodano do grupy/)
    await expect(page.getByTestId('people-import-memberships-waiting')).toContainText('1')
    await expect(page.getByTestId('people-import-create-memberships')).toBeVisible()
    // Each committed row links its participant to the person's record.
    await expect(page.getByTestId('people-import-row-person').first()).toHaveAttribute(
      'href',
      /^\/backend\/people\/persons\/[0-9a-f-]{36}$/,
    )
    Object.assign(violations, await scanInColorSchemes(page, testInfo, 'committed', ready, { platformBaseline: true }))
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await ready()

    await createGroup(request, token, { sectionId: academy, name: 'Brak', kind: 'team' })
    await page.getByTestId('people-import-create-memberships').click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Create memberships|Utwórz członkostwa/ })
      .click()
    await expect(page.getByTestId('people-import-row-3-membership')).toContainText(/Added to the group|Dodano do grupy/)
    await expect(page.getByTestId('people-import-create-memberships')).toHaveCount(0)
    await expect(page.getByTestId('people-import-summary-membershipsCreated')).toContainText('2')
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
