import { expect, test } from '@playwright/test'
import { expectOperation, undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  OPTIMISTIC_LOCK_HEADER,
  actionLogs,
  calendarDate,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
  getPerson,
  mercato,
} from '../_fixtures/club'

// TEST-F01 (foundation spec): `authorizeScoped` inside `people.persons.update` — cross-organization 403, stale lock
// token 409, two concurrent writers (second 409), acting role in the log context, undo re-authorized against the
// current scope, and a job command recorded as `system`.
test.describe.configure({ timeout: 300_000 })

type UpdateResult = { ok?: boolean; updatedAt?: string; actingRole?: string; code?: string }

test('TEST-F01 authorizeScoped: scope, lock, concurrency, acting role, undo and job scope', async ({ request }) => {
  const club = await createClub(request, 'test-f01')
  try {
    const personId = await createPerson(request, club.adminToken, { firstName: 'Ola', lastName: 'Nowak' })
    const detail = await getPerson(request, club.adminToken, personId)
    expect(detail.status).toBe(200)
    let token = String(detail.body?.updatedAt)

    const update = (firstName: string, lockToken: string) =>
      call<UpdateResult>(request, 'PUT', '/api/people/persons', club.adminToken, {
        data: { id: personId, firstName },
        headers: { [OPTIMISTIC_LOCK_HEADER]: lockToken },
      })

    // Allowed update: the acting role is server-derived and lands in the log context.
    const first = await update('Olga', token)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body?.actingRole).toBe('club_admin')
    const logs = await actionLogs(request, club.adminToken, personId)
    const updateLog = logs.find((entry) => entry.commandId === 'people.persons.update')
    expect(updateLog?.context?.actingRole).toBe('club_admin')

    // Stale lock token → 409.
    const stale = await update('Stale', token)
    expect(stale.status).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')

    // Two concurrent writers with the same token: the second waits for the row lock and gets 409.
    token = String(first.body?.updatedAt)
    const racers = await Promise.all([update('Racer A', token), update('Racer B', token)])
    expect(racers.map((result) => result.status).sort()).toEqual([200, 409])
    const winner = racers.find((result) => result.status === 200)
    token = String(winner?.body?.updatedAt)

    // Cross-organization update → 403 scope_denied.
    const second = await createSecondOrganization(request, club)
    const foreignPersonId = await createPerson(request, second.adminToken, { firstName: 'Obca', lastName: 'Osoba' })
    const foreignDetail = await getPerson(request, second.adminToken, foreignPersonId)
    const crossOrg = await call<UpdateResult>(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: foreignPersonId, firstName: 'Hijack' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(foreignDetail.body?.updatedAt) },
    })
    expect(crossOrg.status, JSON.stringify(crossOrg.body)).toBe(403)
    expect(crossOrg.body?.code).toBe('scope_denied')
    expect((await getPerson(request, second.adminToken, foreignPersonId)).body?.firstName).toBe('Obca')

    // An allowed undo restores the previous value.
    const undoable = await update('Undo me', token)
    expect(undoable.status).toBe(200)
    const undoOk = await undoByToken(request, club.adminToken, expectOperation(undoable.response, 'update').undoToken)
    expect(undoOk.status(), await undoOk.text()).toBe(200)
    const afterUndo = await getPerson(request, club.adminToken, personId)
    expect(afterUndo.body?.firstName).toBe(winner === racers[0] ? 'Racer A' : 'Racer B')

    // After the administrator loses the club_admin grant, the undo is refused by `authorizeReplay`.
    const kept = await update('Kept', String(afterUndo.body?.updatedAt))
    expect(kept.status).toBe(200)
    const operation = expectOperation(kept.response, 'update before losing the grant')
    const assignments = await call<{ items?: { id: string; role: string; updatedAt: string }[] }>(
      request,
      'GET',
      `/api/people/role-assignments?personId=${club.adminPersonId}`,
      club.adminToken,
    )
    const adminAssignment = assignments.body?.items?.find((item) => item.role === 'club_admin')
    expect(adminAssignment).toBeTruthy()
    const ended = await call(request, 'PUT', '/api/people/role-assignments', club.adminToken, {
      data: { id: adminAssignment?.id, validFrom: '2020-01-01', validTo: calendarDate(-1) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(adminAssignment?.updatedAt) },
    })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const refused = await undoByToken(request, club.adminToken, operation.undoToken)
    expect(refused.status()).toBe(403)
    expect(((await refused.json()) as { code?: string }).code).toBe('scope_denied')

    // A job command runs with the system_job grant and records `system`.
    const job = mercato([
      'people',
      'sync-role-expiry',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
    ]) as { actingRole?: string } | null
    expect(job?.actingRole).toBe('system')
  } finally {
    await club.cleanup()
  }
})
