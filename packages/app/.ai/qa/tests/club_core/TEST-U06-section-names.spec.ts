import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { call, createClub, createSecondOrganization, type Club } from '../_fixtures/club'
import { create, getOne, remove, update, type SectionItem } from '../_fixtures/club-structure'
import { actionLogEntries } from '../_fixtures/people'

// TEST-U06 (UX parity spec REQ-U02, DD-U05, DD-U07; issue #85): section names are unique case-insensitively among
// the club's live sections (409 `section_name_taken` with a field error on `name`, also when an undo would duplicate
// one), and 2–80 characters on create and rename (422 `section_name_length`); a stored longer name saves unchanged.
// A soft-deleted section frees its name, and another club may use the same name.
test.describe.configure({ timeout: 300_000 })

type NameError = { code?: string; field?: string; fieldErrors?: Record<string, string> }

async function section(request: Parameters<typeof getOne>[0], club: Club, id: string): Promise<SectionItem> {
  const row = await getOne(request, club.adminToken, 'sections', id)
  if (!row) throw new Error('[internal] section not found: ' + id)
  return row
}

async function undoTokenOf(request: Parameters<typeof getOne>[0], club: Club, id: string, commandId: string) {
  const entry = (await actionLogEntries(request, club.adminToken, id)).find((item) => item.commandId === commandId)
  expect(entry?.undoToken, `undo token of ${commandId}`).toBeTruthy()
  return String(entry?.undoToken)
}

function expectNameError(body: unknown, code: string) {
  const error = body as NameError
  expect(error.code).toBe(code)
  expect(error.field).toBe('name')
  expect(error.fieldErrors?.name).toBeTruthy()
}

test('TEST-U06 unique names of 2–80 characters; a stored longer name keeps saving', async ({ request }) => {
  const club = await createClub(request, 'test-u06-names')
  try {
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    const chess = await create(request, club.adminToken, 'sections', { name: 'Szachy' })

    // Create: a duplicate in another case, a 1-character and an 81-character name.
    const duplicate = await call(request, 'POST', '/api/club_core/sections', club.adminToken, {
      data: { name: 'BASEN' },
    })
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(409)
    expectNameError(duplicate.body, 'section_name_taken')
    for (const name of ['B', 'x'.repeat(81)]) {
      const invalid = await call(request, 'POST', '/api/club_core/sections', club.adminToken, { data: { name } })
      expect(invalid.status, JSON.stringify(invalid.body)).toBe(422)
      expectNameError(invalid.body, 'section_name_length')
    }

    // Rename: into an existing name in another case, and to one character.
    let current = await section(request, club, chess)
    const taken = await update(request, club.adminToken, 'sections', { id: chess, name: ' basen ' }, current.updatedAt)
    expect(taken.status, JSON.stringify(taken.body)).toBe(409)
    expectNameError(taken.body, 'section_name_taken')
    const short = await update(request, club.adminToken, 'sections', { id: chess, name: 'S' }, current.updatedAt)
    expect(short.status, JSON.stringify(short.body)).toBe(422)
    expectNameError(short.body, 'section_name_length')
    expect((await section(request, club, chess)).name).toBe('Szachy')

    // A legacy section with a 120-character name, inserted directly, saves with its name unchanged; a rename of it
    // follows the rule.
    const legacyName = 'L'.repeat(120)
    const legacy = await create(request, club.adminToken, 'sections', { name: 'Legacy' })
    await withClient(async (client) => {
      await client.query('update club_core_sections set name = $1 where id = $2', [legacyName, legacy])
    })
    current = await section(request, club, legacy)
    const kept = await update(
      request,
      club.adminToken,
      'sections',
      { id: legacy, name: legacyName, description: 'Stara sekcja' },
      current.updatedAt,
    )
    expect(kept.status, JSON.stringify(kept.body)).toBe(200)
    current = await section(request, club, legacy)
    expect(current.name).toBe(legacyName)
    const longer = await update(
      request,
      club.adminToken,
      'sections',
      { id: legacy, name: `${legacyName}X` },
      current.updatedAt,
    )
    expect(longer.status, JSON.stringify(longer.body)).toBe(422)

    // A deleted section frees its name; another club may hold the same name.
    const poolRow = await section(request, club, pool)
    expect((await remove(request, club.adminToken, 'sections', pool, poolRow.updatedAt)).status).toBe(200)
    await create(request, club.adminToken, 'sections', { name: 'basen' })
    const other = await createSecondOrganization(request, club)
    await create(request, other.adminToken, 'sections', { name: 'Szachy' })
  } finally {
    await club.cleanup()
  }
})

test('TEST-U06 an undo that would duplicate a name answers 409', async ({ request }) => {
  const club = await createClub(request, 'test-u06-undo')
  try {
    // Undo of a rename into a name taken meanwhile.
    const alpha = await create(request, club.adminToken, 'sections', { name: 'Akademia' })
    let current = await section(request, club, alpha)
    const renamed = await update(
      request,
      club.adminToken,
      'sections',
      { id: alpha, name: 'Akademia piłkarska' },
      current.updatedAt,
    )
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    await create(request, club.adminToken, 'sections', { name: 'akademia' })
    const undoRename = await undoByToken(
      request,
      club.adminToken,
      await undoTokenOf(request, club, alpha, 'club_core.sections.update'),
    )
    expect(undoRename.status()).toBe(409)
    expectNameError(await undoRename.json(), 'section_name_taken')
    expect((await section(request, club, alpha)).name).toBe('Akademia piłkarska')

    // Undo of a delete whose name was taken meanwhile.
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    current = await section(request, club, pool)
    expect((await remove(request, club.adminToken, 'sections', pool, current.updatedAt)).status).toBe(200)
    await create(request, club.adminToken, 'sections', { name: 'BASEN' })
    const undoDelete = await undoByToken(
      request,
      club.adminToken,
      await undoTokenOf(request, club, pool, 'club_core.sections.delete'),
    )
    expect(undoDelete.status()).toBe(409)
    expectNameError(await undoDelete.json(), 'section_name_taken')
  } finally {
    await club.cleanup()
  }
})
