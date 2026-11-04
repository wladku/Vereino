import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { createClub, type Club } from '../_fixtures/club'
import { create, getOne, list, remove, update, type SectionItem } from '../_fixtures/club-structure'
import { createGroup, getGroup, postGroup, updateGroup } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'

// TEST-U05 (UX parity spec REQ-U02, DD-U04, DD-U08; issue #85): a section with active groups cannot be deactivated
// or deleted — 409 `section_has_active_groups` listing the groups and nothing changes —, neither by an undo; the
// section list carries the active group count (`groups.section-groups` enricher); a group write and a section
// deactivation serialize on the section row (FOR UPDATE against FOR SHARE), so no inactive section keeps an active
// group; after the groups are deactivated the section deactivates and the count reads 0.
test.describe.configure({ timeout: 300_000 })

type Usage = { code?: string; details?: { groups?: { id: string; name: string }[]; total?: number } }
type Counted = SectionItem & { _groups?: { activeGroupCount: number }; isPublic?: boolean }

async function section(request: Parameters<typeof getOne>[0], club: Club, id: string): Promise<Counted> {
  const row: Counted | undefined = await getOne(request, club.adminToken, 'sections', id)
  if (!row) throw new Error('[internal] section not found: ' + id)
  return row
}

async function undoTokenOf(request: Parameters<typeof getOne>[0], club: Club, id: string, commandId: string) {
  const entry = (await actionLogEntries(request, club.adminToken, id)).find((item) => item.commandId === commandId)
  expect(entry?.undoToken, `undo token of ${commandId}`).toBeTruthy()
  return String(entry?.undoToken)
}

/** True when the promise has not settled within `ms`. */
async function stillPending(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const marker = Symbol('pending')
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      resolve(marker)
    }, ms)
  })
  const settled = await Promise.race([promise.then(() => null), timeout])
  return settled === marker
}

test('TEST-U05 deactivation and delete are refused while active groups remain; the count follows', async ({
  request,
}) => {
  const club = await createClub(request, 'test-u05-guard')
  try {
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    const chess = await create(request, club.adminToken, 'sections', { name: 'Szachy' })
    const beginners = await createGroup(request, club.adminToken, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })
    const advanced = await createGroup(request, club.adminToken, {
      sectionId: pool,
      name: 'Basen — zaawansowani',
      kind: 'class_group',
    })

    // The list carries the active group count and the public state.
    const rows = (await list(request, club.adminToken, 'sections')).items as Counted[]
    expect(rows.find((row) => row.id === pool)?._groups).toEqual({ activeGroupCount: 2 })
    expect(rows.find((row) => row.id === chess)?._groups).toEqual({ activeGroupCount: 0 })
    expect(rows.find((row) => row.id === pool)?.isPublic).toBe(false)

    // Deactivating and deleting answer 409 with both groups; nothing changes.
    let current = await section(request, club, pool)
    const deactivate = await update(
      request,
      club.adminToken,
      'sections',
      { id: pool, isActive: false },
      current.updatedAt,
    )
    expect(deactivate.status, JSON.stringify(deactivate.body)).toBe(409)
    const refused = deactivate.body as Usage
    expect(refused.code).toBe('section_has_active_groups')
    expect(refused.details?.total).toBe(2)
    expect(refused.details?.groups?.map((group) => group.id).sort()).toEqual([beginners, advanced].sort())
    expect(refused.details?.groups?.map((group) => group.name)).toEqual([
      'Basen — początkujący',
      'Basen — zaawansowani',
    ])
    const deleted = await remove(request, club.adminToken, 'sections', pool, current.updatedAt)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(409)
    expect((deleted.body as Usage).code).toBe('section_has_active_groups')
    current = await section(request, club, pool)
    expect(current.isActive).toBe(true)

    // Other changes of a section in use still save (the guard fires on deactivation only).
    const renamed = await update(
      request,
      club.adminToken,
      'sections',
      { id: pool, description: 'Pływalnia' },
      current.updatedAt,
    )
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)

    // After the groups are deactivated the section deactivates and its count reads 0.
    for (const id of [beginners, advanced]) {
      const group = await getGroup(request, club.adminToken, id)
      const ended = await updateGroup(request, club.adminToken, { id, isActive: false }, group.body?.updatedAt)
      expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    }
    current = await section(request, club, pool)
    expect(current._groups).toEqual({ activeGroupCount: 0 })
    const done = await update(request, club.adminToken, 'sections', { id: pool, isActive: false }, current.updatedAt)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    current = await section(request, club, pool)
    expect(current.isActive).toBe(false)

    // An inactive section takes no active group (the existing 422), and deleting it without active groups works.
    const refusedGroup = await postGroup(request, club.adminToken, {
      sectionId: pool,
      name: 'Nowa',
      kind: 'class_group',
    })
    expect(refusedGroup.status, JSON.stringify(refusedGroup.body)).toBe(422)
    expect(refusedGroup.body?.code).toBe('group_section_inactive')
    const chessRow = await section(request, club, chess)
    const chessDeleted = await remove(request, club.adminToken, 'sections', chess, chessRow.updatedAt)
    expect(chessDeleted.status, JSON.stringify(chessDeleted.body)).toBe(200)
  } finally {
    await club.cleanup()
  }
})

test('TEST-U05 undo never deactivates or deletes a section that holds an active group', async ({ request }) => {
  const club = await createClub(request, 'test-u05-undo')
  try {
    // Undo of an activation: the section was inactive, got activated, then a group was created in it.
    const chess = await create(request, club.adminToken, 'sections', { name: 'Szachy', isActive: false })
    let current = await section(request, club, chess)
    const activated = await update(
      request,
      club.adminToken,
      'sections',
      { id: chess, isActive: true },
      current.updatedAt,
    )
    expect(activated.status, JSON.stringify(activated.body)).toBe(200)
    await createGroup(request, club.adminToken, { sectionId: chess, name: 'Szachiści', kind: 'class_group' })
    const undoActivation = await undoByToken(
      request,
      club.adminToken,
      await undoTokenOf(request, club, chess, 'club_core.sections.update'),
    )
    expect(undoActivation.status()).toBe(409)
    expect(((await undoActivation.json()) as Usage).code).toBe('section_has_active_groups')
    current = await section(request, club, chess)
    expect(current.isActive).toBe(true)

    // Undo of a create: the created section got a group meanwhile.
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    await createGroup(request, club.adminToken, { sectionId: pool, name: 'Pływacy', kind: 'class_group' })
    const undoCreate = await undoByToken(
      request,
      club.adminToken,
      await undoTokenOf(request, club, pool, 'club_core.sections.create'),
    )
    expect(undoCreate.status()).toBe(409)
    expect(((await undoCreate.json()) as Usage).code).toBe('section_has_active_groups')
    expect((await section(request, club, pool)).isActive).toBe(true)
  } finally {
    await club.cleanup()
  }
})

test('TEST-U05 a group write and a section deactivation serialize on the section row', async ({ request }) => {
  const club = await createClub(request, 'test-u05-race')
  const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
  try {
    // 1. The deactivation holds the section row FOR UPDATE: a group create waits, then sees the inactive section.
    const pool = await create(request, club.adminToken, 'sections', { name: 'Basen' })
    const createdWhileLocked = await withClient(async (client) => {
      await client.query('begin')
      await client.query('select id from club_core_sections where id = $1 for update', [pool])
      const pending = postGroup(request, club.adminToken, { sectionId: pool, name: 'Wyścig', kind: 'class_group' })
      expect(await stillPending(pending, 2000)).toBe(true)
      await client.query('update club_core_sections set is_active = false, updated_at = now() where id = $1', [pool])
      await client.query('commit')
      return pending
    })
    expect(createdWhileLocked.status, JSON.stringify(createdWhileLocked.body)).toBe(422)
    expect(createdWhileLocked.body?.code).toBe('group_section_inactive')

    // 2. A group write holds the section row FOR SHARE: the deactivation waits, then sees the new active group.
    const chess = await create(request, club.adminToken, 'sections', { name: 'Szachy' })
    const current = await section(request, club, chess)
    const groupId = randomUUID()
    const deactivatedWhileShared = await withClient(async (client) => {
      await client.query('begin')
      await client.query('select id from club_core_sections where id = $1 for share', [chess])
      const pending = update(request, club.adminToken, 'sections', { id: chess, isActive: false }, current.updatedAt)
      expect(await stillPending(pending, 2000)).toBe(true)
      await client.query(
        `insert into groups_groups (id, tenant_id, organization_id, created_at, updated_at, section_id, name, kind, is_active)
         values ($1, $2, $3, now(), now(), $4, 'Szachiści', 'class_group', true)`,
        [groupId, scope.tenantId, scope.organizationId, chess],
      )
      await client.query('commit')
      return pending
    })
    expect(deactivatedWhileShared.status, JSON.stringify(deactivatedWhileShared.body)).toBe(409)
    expect((deactivatedWhileShared.body as Usage).details?.groups?.map((group) => group.id)).toEqual([groupId])

    // No inactive section of the club holds an active group.
    const orphans = await withClient(async (client) => {
      const result = await client.query<{ id: string }>(
        `select g.id from groups_groups g join club_core_sections s on s.id = g.section_id
         where g.organization_id = $1 and g.is_active and g.deleted_at is null and (not s.is_active or s.deleted_at is not null)`,
        [scope.organizationId],
      )
      return result.rows
    })
    expect(orphans).toEqual([])
  } finally {
    await club.cleanup()
  }
})
