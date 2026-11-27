import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { redoByLogId, undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { birthDateTurning, calendarDate, call, createPerson, OPTIMISTIC_LOCK_HEADER, type Club } from '../_fixtures/club'
import { personVersion } from '../_fixtures/medical'
import { actionLogEntries } from '../_fixtures/people'
import { markAndConfirm, pictureId, pictureOf, picturePath, pictureScene } from '../_fixtures/pictures'

// Event photos spec phase 2 (#872; REQ-I10, REQ-I11, BR-I07, DD-I12, DD-I13, J-I05, AC-I07): TEST-I08 — a former
// participant is marked on two pictures of "PRZYKŁAD CUP 2026": one live, one whose add was undone (soft-deleted). A
// third picture marks nobody and staff delete it: its row and bytes are gone at once and the undo of that delete answers
// 409 `club_event_picture_erased`. Anonymising the former participant deletes both marked pictures, their marks and
// their bytes, lists the picture ids as tombstones on the erasure's audit entry, and keeps the unmarked live picture;
// the undo of the live picture's add and of its marks, and the redo of the undone add, answer 409
// `club_event_picture_erased`. The new tables are in the club's table list (club deletion is covered by TEST-M07).
test.describe.configure({ timeout: 420_000 })

type Row = { id: string; attachment_id: string }

async function pictureRows(club: Club, ids: string[]): Promise<Row[]> {
  return withClient(async (client) => {
    const rows = await client.query<Row>(
      `select id, attachment_id from activities_club_event_files where tenant_id = $1 and id = any($2::uuid[])`,
      [club.tenant.tenantId, ids],
    )
    return rows.rows
  })
}

async function attachmentCount(ids: string[]): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(`select count(*) from attachments where id = any($1::uuid[])`, [
      ids,
    ])
    return Number(rows.rows[0]?.count ?? 0)
  })
}

async function markCount(club: Club, personId: string): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(
      `select count(*) from activities_club_event_file_people where tenant_id = $1 and person_id = $2`,
      [club.tenant.tenantId, personId],
    )
    return Number(rows.rows[0]?.count ?? 0)
  })
}

test('TEST-I08 anonymising a person deletes the pictures marking them for good; no undo or redo brings them back', async ({
  request,
}) => {
  const scene = await pictureScene(request, 'test-i08')
  const { club, eventId, coordinator } = scene
  const admin = club.adminToken
  try {
    const former = await createPerson(request, admin, {
      firstName: 'Bartek',
      lastName: 'Dawny',
      birthDate: birthDateTurning(25),
    })
    const live = await pictureId(request, coordinator, eventId, { description: 'Finał seniorów' })
    await markAndConfirm(request, coordinator, eventId, live, [former])
    const undone = await pictureId(request, coordinator, eventId, { description: 'Rozgrzewka seniorów' })
    await markAndConfirm(request, coordinator, eventId, undone, [former])
    const kept = await pictureId(request, coordinator, eventId, { description: 'Hala z daleka' })
    const staffDeleted = await pictureId(request, coordinator, eventId, { description: 'Do usunięcia' })

    // The undo of an add only unlinks the picture (soft delete); its marks stay until the erasure.
    const addLog = (await actionLogEntries(request, coordinator, undone)).find(
      (entry) => entry.commandId === 'activities.club_event_files.add',
    )
    expect(addLog?.undoToken).toBeTruthy()
    const undoAdd = await undoByToken(request, coordinator, String(addLog?.undoToken))
    expect(undoAdd.status(), await undoAdd.text()).toBe(200)

    // Staff delete a picture: final, the bytes are released, and its undo answers 409.
    const [staffRow] = await pictureRows(club, [staffDeleted])
    const deleted = await call(request, 'DELETE', picturePath(eventId, staffDeleted), coordinator, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: (await pictureOf(request, coordinator, eventId, staffDeleted)).updatedAt },
    })
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    expect(await pictureRows(club, [staffDeleted])).toEqual([])
    await expect.poll(() => attachmentCount([String(staffRow?.attachment_id)])).toBe(0)
    const deleteLog = (await actionLogEntries(request, coordinator, staffDeleted)).find(
      (entry) => entry.commandId === 'activities.club_event_files.delete',
    )
    const undoDelete = await undoByToken(request, coordinator, String(deleteLog?.undoToken))
    expect(undoDelete.status(), await undoDelete.text()).toBe(409)
    expect(await undoDelete.text()).toContain('club_event_picture_erased')

    // The erasure of the former participant.
    const marked = await pictureRows(club, [live, undone])
    expect(marked).toHaveLength(2)
    const lastDay = calendarDate()
    const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', admin, {
      data: { personIds: [former], lastDay },
    })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const departed = await call(request, 'POST', '/api/people/departures', admin, {
      data: { personIds: [former], lastDay, previewToken: preview.body?.previewToken },
    })
    expect(departed.status, JSON.stringify(departed.body)).toBe(200)
    const recorded = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', admin, {
      data: { subjectPersonId: former, requesterKind: 'self', erasure: true, note: 'Pismo' },
    })
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201)
    const anonymized = await call<{ audit?: { erasedRecords?: { kind: string; ids: string[] }[] } }>(
      request,
      'POST',
      `/api/people/persons/${former}/anonymize`,
      admin,
      {
        data: { requestId: String(recorded.body?.id), confirmLastName: 'Dawny' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: await personVersion(request, admin, former) },
      },
    )
    expect(anonymized.status, JSON.stringify(anonymized.body)).toBe(200)
    expect(await pictureRows(club, [live, undone])).toEqual([])
    expect(await markCount(club, former)).toBe(0)
    await expect.poll(() => attachmentCount(marked.map((row) => row.attachment_id))).toBe(0)
    expect((await pictureRows(club, [kept])).map((row) => row.id)).toEqual([kept])
    const erasureLog = (await actionLogEntries(request, admin, former)).find(
      (entry) => entry.commandId === 'people.persons.anonymize',
    )
    const erased = (erasureLog?.context?.erasedRecords ?? []) as { kind: string; ids: string[] }[]
    expect(erased.find((entry) => entry.kind === 'activities.club_event_file')?.ids.sort()).toEqual(
      [live, undone].sort(),
    )

    // No undo or redo brings an erased picture back.
    const liveLogs = await actionLogEntries(request, coordinator, live)
    for (const commandId of ['activities.club_event_files.add', 'activities.club_event_files.set_people']) {
      const entry = liveLogs.find((log) => log.commandId === commandId)
      expect(entry?.undoToken, commandId).toBeTruthy()
      const replay = await undoByToken(request, coordinator, String(entry?.undoToken))
      expect(replay.status(), `${commandId}: ${await replay.text()}`).toBe(409)
      expect(await replay.text()).toContain('club_event_picture_erased')
    }
    const redo = await redoByLogId(request, coordinator, String(addLog?.id))
    expect(redo.status(), await redo.text()).toBe(409)
    expect(await redo.text()).toContain('club_event_picture_erased')
  } finally {
    await club.cleanup()
  }
})
