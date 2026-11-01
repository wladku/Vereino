import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { actionLogs, calendarDate, call, createClub, createPerson, getPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { createGroup, roster } from '../_fixtures/groups'
import {
  PESEL_EXISTING_CHILD,
  PESEL_NEW_CHILD,
  PESEL_RENAMED_CHILD,
  byRowNo,
  classifications,
  csvFile,
  decideRow,
  familiesXlsx,
  familyRows,
  getImport,
  importAction,
  importRows,
  previewImport,
  purgeImports,
  rawImportFile,
  rawImportRows,
  uploadImport,
  xlsxFile,
  type ImportRowView,
  type ImportView,
} from '../_fixtures/imports'
import { actionLogEntries, createGuardianship, guardianships, persons } from '../_fixtures/people'

// TEST-051 (club spec *Integration Coverage*, REQ-036, AC-036, DD-38, Q-044; issue #28): a sheet with a new family, a
// family already in the club (same PESEL), a child with a changed surname (same PESEL), a row without a PESEL or
// identifier, a row with a bad date and a repeated row is previewed as new / matched / review / error; the review row
// waits for a decision (undoable); the commit creates the persons and guardianships once, updates the surname and
// records who ran it; the same file imported again creates nothing; the file sits in the private attachments
// partition, the staged rows are ciphertext, and both are purged 30 days after the commit. The same sheet as an XLSX
// built in the test classifies the same way. Membership part (phase 2, D-026, #65): with `groups` enabled the row's
// group "Orliki U8" matches no group of the club, so the row waits with `group_not_found` through the purge; once the
// group exists, re-running the commit creates the participant's membership exactly once.
test.describe.configure({ timeout: 300_000 })

const EXPECTED_PREVIEW: [number, string, string | null][] = [
  [2, 'new', null],
  [3, 'matched', null],
  [4, 'matched', null],
  [5, 'review', null],
  [6, 'error', 'import_date_invalid'],
  [7, 'error', 'import_row_duplicate'],
]

type ClubFamily = { childId: string; motherId: string; renamedId: string }

/** The club before the import: Zofia with her mother Maria (primary payer), and Tomasz under his old surname. */
async function seedClub(request: Parameters<typeof createPerson>[0], token: string): Promise<ClubFamily> {
  const childId = await createPerson(request, token, {
    firstName: 'Zofia',
    lastName: 'Kowalska',
    birthDate: '2015-06-12',
    pesel: PESEL_EXISTING_CHILD,
  })
  const motherId = await createPerson(request, token, { firstName: 'Maria', lastName: 'Kowalska' })
  await createGuardianship(request, token, {
    guardianPersonId: motherId,
    wardPersonId: childId,
    isPrimaryPayer: true,
    validFrom: calendarDate(-10),
  })
  const renamedId = await createPerson(request, token, {
    firstName: 'Tomasz',
    lastName: 'Nowak',
    birthDate: '2010-11-01',
    pesel: PESEL_RENAMED_CHILD,
  })
  return { childId, motherId, renamedId }
}

async function personCount(request: Parameters<typeof persons>[0], token: string): Promise<number> {
  const listed = await persons(request, token)
  expect(listed.status).toBe(200)
  return listed.items.length
}

function row(rows: readonly ImportRowView[], rowNo: number): ImportRowView {
  const found = byRowNo(rows).get(rowNo)
  if (!found) throw new Error(`[internal] row ${String(rowNo)} missing`)
  return found
}

test('TEST-051 CSV import: preview, review queue with undo, commit once, re-import creates nothing, encrypted and purged', async ({
  request,
}) => {
  const club = await createClub(request, 'test-051-csv')
  try {
    const token = club.adminToken
    const family = await seedClub(request, token)
    const before = await personCount(request, token)

    // Preview: every row classified; the problem names the column, never the value.
    const preview = await previewImport(request, token, csvFile())
    expect(preview).toMatchObject({
      status: 'previewed',
      fileFormat: 'csv',
      rowCount: 6,
      summary: { new: 1, matched: 2, review: 1, error: 2 },
      createdBy: { personId: club.adminPersonId },
      pendingDecisions: 1,
      fileAvailable: true,
    })
    let rows = await importRows(request, token, preview.id)
    expect(classifications(rows)).toEqual(EXPECTED_PREVIEW)
    expect(row(rows, 6).errorColumn).toBe('Data urodzenia')
    expect(JSON.stringify(row(rows, 6))).not.toContain('31.02.2015')
    expect(row(rows, 3).matchedPerson?.personId).toBe(family.childId)
    expect(row(rows, 4).matchedPerson?.personId).toBe(family.renamedId)
    expect(row(rows, 5)).toMatchObject({ reviewReason: 'identifier_missing', needsDecision: true })
    expect(await importRows(request, token, preview.id, '&pending=true')).toHaveLength(1)
    // Nothing is written before the commit.
    expect(await personCount(request, token)).toBe(before)

    // The file is in the private partition; the staged rows are ciphertext.
    const file = await rawImportFile(preview.id)
    expect(file).toMatchObject({ partition_code: 'privateAttachments', entity_id: 'people:person_import' })
    const raw = await rawImportRows(preview.id)
    expect(raw).toHaveLength(6)
    for (const stored of raw) {
      expect(stored.raw).toBeTruthy()
      expect(stored.raw).not.toContain('Kowalska')
      expect(stored.raw).not.toContain(PESEL_NEW_CHILD)
    }

    // The review row blocks the commit until it is decided.
    const blocked = await importAction(request, token, preview.id, 'commit', preview.updatedAt)
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(422)
    expect(blocked.body).toMatchObject({ code: 'import_review_pending', rowNos: [5] })

    // Decisions: an error row takes none; an identified row only a skip; a stale lock token is 409.
    expect((await decideRow(request, token, preview.id, row(rows, 6), { action: 'skip' })).body?.code).toBe(
      'import_decision_invalid',
    )
    expect((await decideRow(request, token, preview.id, row(rows, 3), { action: 'create' })).body?.code).toBe(
      'import_decision_invalid',
    )
    const stale = await decideRow(
      request,
      token,
      preview.id,
      row(rows, 5),
      { action: 'skip' },
      '2020-01-01T00:00:00.000Z',
    )
    expect(stale.status).toBe(409)
    const missingPerson = await decideRow(request, token, preview.id, row(rows, 5), {
      action: 'match',
      personId: '11111111-1111-4111-8111-111111111111',
    })
    expect(missingPerson.body?.code).toBe('import_person_not_found')

    // A skip, undone through the audit log, then "create".
    const skipped = await decideRow(request, token, preview.id, row(rows, 5), { action: 'skip' })
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200)
    const entries = await actionLogEntries(request, token, row(rows, 5).id)
    const undoToken = entries.find((entry) => entry.commandId === 'people.imports.decide_row')?.undoToken
    expect(undoToken).toBeTruthy()
    const undone = await undoByToken(request, token, String(undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    rows = await importRows(request, token, preview.id)
    expect(row(rows, 5)).toMatchObject({ decision: null, needsDecision: true })
    const created = await decideRow(request, token, preview.id, row(rows, 5), { action: 'create' })
    expect(created.status, JSON.stringify(created.body)).toBe(200)

    // A stale import token is refused; the commit with the current one writes everything once.
    expect((await importAction(request, token, preview.id, 'commit', '2020-01-01T00:00:00.000Z')).status).toBe(409)
    const current = (await getImport(request, token, preview.id)).body as ImportView
    expect(current.pendingDecisions).toBe(0)
    const committed = await importAction(request, token, preview.id, 'commit', current.updatedAt)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body).toMatchObject({
      status: 'committed',
      committedBy: { personId: club.adminPersonId },
      summary: { created: 4, updated: 1, linked: 2, skipped: 2, membershipsPending: 1 },
    })
    expect(await personCount(request, token)).toBe(before + 4)
    expect((await getPerson(request, token, family.renamedId)).body).toMatchObject({ lastName: 'Nowak-Wiśniewski' })

    rows = await importRows(request, token, preview.id)
    const newChildId = row(rows, 2).matchedPerson?.personId ?? null
    expect(newChildId).toBeNull()
    const newRowResult = await call<{ items?: { id: string; firstName: string }[] }>(
      request,
      'GET',
      '/api/people/persons?pageSize=100&lastName=Nowa',
      token,
    )
    const ola = (newRowResult.body?.items ?? []).find((item) => item.firstName === 'Ola')
    expect(ola).toBeTruthy()
    const olaGuardians = await guardianships(request, token, `wardPersonId=${String(ola?.id)}`)
    expect(olaGuardians.items).toHaveLength(1)
    expect(olaGuardians.items[0].isPrimaryPayer).toBe(true)
    // Zofia keeps her one guardianship with Maria (matched, not linked again).
    const zofiaGuardians = await guardianships(request, token, `wardPersonId=${family.childId}`)
    expect(zofiaGuardians.items.map((item) => item.guardianPersonId)).toEqual([family.motherId])
    // The group stays on the row (D-026). `groups` registers its hook, but no group of the club is called "Orliki U8",
    // so the row waits with that reason (#65; before the hook the reason was `groups_not_enabled`) and no membership
    // is created.
    expect(row(rows, 2)).toMatchObject({ groupName: 'Orliki U8', membershipStatus: 'group_not_found' })
    const memberships = await call<{ items?: unknown[] }>(request, 'GET', '/api/groups/memberships?pageSize=100', token)
    expect(memberships.status).toBe(200)
    expect(memberships.body?.items ?? []).toEqual([])

    // The audit log records who ran it and what it created.
    const audit = await actionLogs(request, token, preview.id)
    const commitEntry = audit.find((entry) => entry.commandId === 'people.imports.commit')
    expect(commitEntry?.context).toMatchObject({ actingRole: 'club_admin' })
    expect((commitEntry?.context?.createdPersonIds as unknown[] | undefined) ?? []).toHaveLength(4)

    // Exactly once: a second commit re-runs only the waiting membership (#65) — still no group, so nothing is written.
    const again = await importAction(request, token, preview.id, 'commit', committed.body?.updatedAt ?? null)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body?.summary).toMatchObject({ created: 4, membershipsCreated: 0, membershipsPending: 1 })
    expect(await personCount(request, token)).toBe(before + 4)
    expect(row(await importRows(request, token, preview.id), 2).membershipStatus).toBe('group_not_found')

    // The same file again: everyone is found; the review row is matched to the person the first import created.
    const second = await previewImport(request, token, csvFile())
    expect(second.summary).toMatchObject({ new: 0, matched: 3, review: 1, error: 2 })
    const secondRows = await importRows(request, token, second.id)
    const jan = await call<{ items?: { id: string; firstName: string }[] }>(
      request,
      'GET',
      '/api/people/persons?pageSize=100&lastName=Bezpeselu',
      token,
    )
    const janId = (jan.body?.items ?? []).find((item) => item.firstName === 'Jan')?.id
    expect(janId).toBeTruthy()
    const matched = await decideRow(request, token, second.id, row(secondRows, 5), {
      action: 'match',
      personId: String(janId),
    })
    expect(matched.status, JSON.stringify(matched.body)).toBe(200)
    const secondCurrent = (await getImport(request, token, second.id)).body as ImportView
    const secondCommit = await importAction(request, token, second.id, 'commit', secondCurrent.updatedAt)
    expect(secondCommit.status, JSON.stringify(secondCommit.body)).toBe(200)
    expect(secondCommit.body?.summary).toMatchObject({ created: 0, updated: 0, linked: 0 })
    expect(await personCount(request, token)).toBe(before + 4)

    // The purge: nothing before 30 days; after them the rows and the file are gone (the row with a group keeps its
    // ids and the group label for the hook, without its values).
    const committedAt = new Date(String(committed.body?.committedAt)).getTime()
    expect(purgeImports(club.tenant, new Date(committedAt + 29 * 86_400_000).toISOString()).counts?.imports).toBe(0)
    const purge = purgeImports(club.tenant, new Date(committedAt + 31 * 86_400_000).toISOString())
    expect(purge.counts).toMatchObject({ imports: 2, files: 2, failed: 0 })
    expect(await rawImportFile(preview.id)).toBeUndefined()
    expect(await rawImportRows(preview.id)).toEqual([{ row_no: 2, raw: null, membership_status: 'group_not_found' }])
    const purged = (await getImport(request, token, preview.id)).body as ImportView
    expect(purged).toMatchObject({ status: 'committed', fileAvailable: false })
    expect(purged.purgedAt).toBeTruthy()
    // Idempotent.
    expect(purgeImports(club.tenant, new Date(committedAt + 32 * 86_400_000).toISOString()).counts?.imports).toBe(0)

    // Phase 2 re-run (D-026, #65): the club creates "Orliki U8"; re-running the commit of the purged import creates
    // Ola's participant membership from today, once; the second import's waiting row finds it already there.
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const orliki = await createGroup(request, token, { sectionId: academy, name: 'Orliki U8', kind: 'team' })
    const rerun = await importAction(request, token, preview.id, 'commit', purged.updatedAt)
    expect(rerun.status, JSON.stringify(rerun.body)).toBe(200)
    expect(rerun.body?.summary).toMatchObject({ membershipsCreated: 1, membershipsPending: 0 })
    expect((await roster(request, token, orliki)).items).toMatchObject([
      { personId: ola?.id, role: 'participant', validFrom: calendarDate(), validTo: null },
    ])
    expect((await importAction(request, token, preview.id, 'commit', rerun.body?.updatedAt ?? null)).body?.code).toBe(
      'import_already_committed',
    )
    const secondPurged = (await getImport(request, token, second.id)).body as ImportView
    const secondRerun = await importAction(request, token, second.id, 'commit', secondPurged.updatedAt)
    expect(secondRerun.status, JSON.stringify(secondRerun.body)).toBe(200)
    expect(secondRerun.body?.summary).toMatchObject({ membershipsCreated: 0, membershipsExisting: 1 })
    expect((await roster(request, token, orliki)).items).toHaveLength(1)
    expect(await personCount(request, token)).toBe(before + 4)
    // The processed rows of the purged imports go with the next purge.
    expect(purgeImports(club.tenant, new Date(committedAt + 33 * 86_400_000).toISOString()).counts).toMatchObject({
      imports: 0,
      rows: 2,
    })
    expect(await rawImportRows(preview.id)).toEqual([])
    expect(await rawImportRows(second.id)).toEqual([])
  } finally {
    await club.cleanup()
  }
})

test('TEST-051 XLSX import: the same sheet as a workbook (serial dates, numeric PESEL) classifies and commits the same way', async ({
  request,
}) => {
  const club = await createClub(request, 'test-051-xlsx')
  try {
    const token = club.adminToken
    await seedClub(request, token)
    const before = await personCount(request, token)
    // 2016-05-01 and 2017-03-15 as Excel serials; the new child's PESEL as a number loses its leading zero.
    const sheet = familyRows({ newChild: 42491, noIdentifier: 42809 })
    sheet[0][3] = Number(PESEL_NEW_CHILD)
    sheet[5] = [...sheet[0]]
    const preview = await previewImport(request, token, xlsxFile(await familiesXlsx(sheet)))
    expect(preview).toMatchObject({
      fileFormat: 'xlsx',
      rowCount: 6,
      summary: { new: 1, matched: 2, review: 1, error: 2 },
    })
    const rows = await importRows(request, token, preview.id)
    expect(classifications(rows)).toEqual(EXPECTED_PREVIEW)
    expect(row(rows, 2).values?.persons.participant).toMatchObject({ birthDate: '2016-05-01', pesel: PESEL_NEW_CHILD })
    expect(row(rows, 5).values?.persons.participant).toMatchObject({ birthDate: '2017-03-15' })
    const decided = await decideRow(request, token, preview.id, row(rows, 5), { action: 'create' })
    expect(decided.status, JSON.stringify(decided.body)).toBe(200)
    const current = (await getImport(request, token, preview.id)).body as ImportView
    const committed = await importAction(request, token, preview.id, 'commit', current.updatedAt)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    expect(committed.body?.summary).toMatchObject({ created: 4, updated: 1, linked: 2 })
    expect(await personCount(request, token)).toBe(before + 4)

    // A file the import cannot read, or a mapping it cannot use, is 422 with the problem — nothing is stored.
    const notSheet = await uploadImport(request, token, {
      name: 'rodziny.xlsx',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n\u0000binary'),
    })
    expect(notSheet.status).toBe(422)
    expect(notSheet.body).toMatchObject({ code: 'import_mapping_invalid', problem: 'format_unsupported' })
    const noNames = await uploadImport(request, token, csvFile(), { 'participant.firstName': 0 })
    expect(noNames.body).toMatchObject({ code: 'import_mapping_invalid', problem: 'participant_name_required' })
    const outside = await uploadImport(request, token, csvFile(), {
      'participant.firstName': 0,
      'participant.lastName': 42,
    })
    expect(outside.body).toMatchObject({ code: 'import_mapping_invalid', problem: 'column_out_of_range' })
    const history = await call<{ items?: unknown[]; total?: number }>(request, 'GET', '/api/people/imports', token)
    expect(history.body?.total).toBe(1)

    // A cancelled import writes nothing and cannot be committed; the cancellation is undoable.
    const other = await previewImport(request, token, csvFile())
    const cancelled = await importAction(request, token, other.id, 'cancel', other.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body?.status).toBe('cancelled')
    expect((await importAction(request, token, other.id, 'commit', cancelled.body?.updatedAt ?? null)).body?.code).toBe(
      'import_cancelled',
    )
    const undoToken = (await actionLogEntries(request, token, other.id)).find(
      (entry) => entry.commandId === 'people.imports.cancel',
    )?.undoToken
    const undone = await undoByToken(request, token, String(undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    expect(((await getImport(request, token, other.id)).body as ImportView).status).toBe('previewed')
    expect(await personCount(request, token)).toBe(before + 4)
  } finally {
    await club.cleanup()
  }
})
