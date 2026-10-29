import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  expectRoles,
  getAssignment,
  getPerson,
  signInAs,
  userRoles,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import {
  SENSITIVE_PERSON_FIELDS,
  actionLogEntries,
  createGuardianship,
  endGuardianship,
  getGuardianship,
  guardianships,
  persons,
  roleAssignments,
  setConsents,
  updateGuardianship,
} from '../_fixtures/people'

// Issue #26 (E02-S02; club spec phase 1 step 3): one record per person with families, consents and roles. Every
// acceptance criterion of the issue body and of its 2026-10-26 clarification has an assertion here; the PESEL
// criterion is TEST-004 (with foundation TEST-F06) and the two-tenant security case is TEST-002. The "action taken as
// coach" part of the first criterion waits for coach scope from group memberships (#30): a coach grant carries
// group ids, so here the combined roles are coordinator + guardian and the recorded acting role is `guardian`.
test.describe.configure({ timeout: 300_000 })

test('E02-S02 one record for a coordinator who is also a guardian: permissions add up, the coordinator role never sees consents, the action records its role', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s02-combined')
  try {
    const sectionA = await createStructure(request, club.adminToken, 'sections', { name: 'Akademia piłkarska' })
    // Marek: coordinator of section A and the guardian of Jaś — one person record with one account.
    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Wielorolowy',
      birthDate: birthDateTurning(40),
    })
    await assignRole(request, club.adminToken, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    const jas = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: 'Wielorolowy',
      birthDate: birthDateTurning(9),
    })
    const ownGuardianship = await createGuardianship(request, club.adminToken, {
      guardianPersonId: marek.personId,
      wardPersonId: jas,
      relation: 'parent',
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: calendarDate(),
    })
    // Another family of the club: Kasia and Ola, with consents and contact details.
    const kasia = await createPerson(request, club.adminToken, {
      firstName: 'Kasia',
      lastName: 'Innarodzina',
      birthDate: birthDateTurning(38),
      email: 'kasia-innarodzina@example.org',
      phone: '+48 500 000 001',
      notes: 'Prefers e-mail',
    })
    const ola = await createPerson(request, club.adminToken, {
      firstName: 'Ola',
      lastName: 'Innarodzina',
      birthDate: birthDateTurning(14),
    })
    const otherGuardianship = await createGuardianship(request, club.adminToken, {
      guardianPersonId: kasia,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: true,
      consents: { regulations: true, image: true, trips: true },
      validFrom: calendarDate(),
    })

    // One person record for Marek, and the permissions add up: coordinator + member + payer (adult guardian).
    await expect
      .poll(async () =>
        (await persons(request, club.adminToken, '&lastName=Wielorolowy')).items.map((item) => item.id).sort(),
      )
      .toEqual([jas, marek.personId].sort())
    await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member', 'vereino_payer'])

    const token = await signInAs(request, club, marek.userId, marek.email)

    // As coordinator: the club's people records club-wide, basic data only.
    const list = await persons(request, token)
    expect(list.status).toBe(200)
    expect(list.items.map((item) => item.id)).toEqual(expect.arrayContaining([kasia, ola, jas, marek.personId]))
    for (const item of list.items) {
      for (const field of ['email', 'phone', 'notes', 'pesel']) expect(item).not.toHaveProperty(field)
    }
    const kasiaAsCoordinator = await getPerson(request, token, kasia)
    expect(kasiaAsCoordinator.status).toBe(200)
    expect(kasiaAsCoordinator.body?.access).toBe('basic')
    for (const field of SENSITIVE_PERSON_FIELDS) expect(kasiaAsCoordinator.body).not.toHaveProperty(field)
    expect(JSON.stringify(kasiaAsCoordinator.body)).not.toContain('Prefers e-mail')
    // As guardian: the ward's full record.
    const jasAsGuardian = await getPerson(request, token, jas)
    expect(jasAsGuardian.body?.access).toBe('full')

    // A section coordinator reads a family's guardianship without its consents (list and detail); his own ward's
    // guardianship comes with the consents because he is its guardian.
    const otherFamily = await guardianships(request, token, `personId=${ola}`)
    expect(otherFamily.status).toBe(200)
    expect(otherFamily.items.map((item) => item.id)).toEqual([otherGuardianship])
    expect(otherFamily.items[0]).not.toHaveProperty('consents')
    expect(otherFamily.raw).not.toContain('regulations')
    const otherDetail = await getGuardianship(request, token, otherGuardianship)
    expect(otherDetail.status).toBe(200)
    expect(otherDetail.body).not.toHaveProperty('consents')
    const ownFamily = await guardianships(request, token, `personId=${jas}`)
    expect(ownFamily.items[0]?.consents?.regulations.granted).toBe(true)
    // The club administrator sees every family's consents.
    const asAdmin = await guardianships(request, club.adminToken, `personId=${ola}`)
    expect(asAdmin.items[0]?.consents?.image.granted).toBe(true)

    // The coordinator role does not let him change another family's consents.
    const deniedConsents = await setConsents(
      request,
      token,
      otherGuardianship,
      { image: false },
      otherDetail.body?.updatedAt,
    )
    expect(deniedConsents.status).toBe(403)
    expect(deniedConsents.body?.code).toBe('scope_denied')
    // Permissions add up, they do not go beyond the roles: no people.manage, so no edit of a person record.
    const jasDetail = await getPerson(request, token, jas)
    const deniedEdit = await call(request, 'PUT', '/api/people/persons', token, {
      data: { id: jas, firstName: 'Janek' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(jasDetail.body?.updatedAt) },
    })
    expect(deniedEdit.status).toBe(403)

    // As guardian he grants the image consent of his ward: the action records the role it was taken as.
    const ownRow = ownFamily.items[0]
    const granted = await setConsents(request, token, ownGuardianship, { image: true }, ownRow?.updatedAt)
    expect(granted.status, JSON.stringify(granted.body)).toBe(200)
    expect(granted.body?.actingRole).toBe('guardian')
    expect(granted.body?.consents?.image.granted).toBe(true)
    expect(granted.body?.consents?.image.byPersonId).toBe(marek.personId)
    expect(granted.body?.consents?.regulations.granted).toBe(true)
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'],
    })
    const logs = await actionLogEntries(request, club.adminToken, ownGuardianship)
    const consentLog = logs.find((entry) => entry.commandId === 'people.guardianships.set_consents')
    expect(consentLog?.context?.actingRole).toBe('guardian')
    const createLog = logs.find((entry) => entry.commandId === 'people.guardianships.create')
    expect(createLog?.context?.actingRole).toBe('club_admin')

    // His role assignments list shows section A only (coordinator scope), and he holds no coach grant.
    const assignments = await roleAssignments(request, token)
    expect(new Set(assignments.items.map((item) => item.sectionId))).toEqual(new Set([sectionA]))
  } finally {
    await club.cleanup()
  }
})

test('E02-S02 one primary payer per ward: a second active one gets 409 and the first stays, also under concurrency', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s02-payer')
  try {
    const ward = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: 'Płatnik',
      birthDate: birthDateTurning(9),
    })
    const mother = await createPerson(request, club.adminToken, { firstName: 'Kasia', lastName: 'Płatnik' })
    const father = await createPerson(request, club.adminToken, { firstName: 'Piotr', lastName: 'Płatnik' })
    const first = await createGuardianship(request, club.adminToken, {
      guardianPersonId: mother,
      wardPersonId: ward,
      isPrimaryPayer: true,
      validFrom: '2020-01-01',
    })

    // A second active primary payer for the same ward → 409; the first stays the payer.
    const second = await call<{ code?: string }>(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: { guardianPersonId: father, wardPersonId: ward, isPrimaryPayer: true, validFrom: calendarDate() },
    })
    expect(second.status).toBe(409)
    expect(second.body?.code).toBe('guardianship_primary_payer_conflict')
    let family = await guardianships(request, club.adminToken, `wardPersonId=${ward}`)
    expect(family.items.map((item) => [item.id, item.isPrimaryPayer])).toEqual([[first, true]])

    // The father as a guardian who does not pay is fine; making him the payer through an update → 409.
    const fatherGuardianship = await createGuardianship(request, club.adminToken, {
      guardianPersonId: father,
      wardPersonId: ward,
      relation: 'parent',
      validFrom: calendarDate(),
    })
    family = await guardianships(request, club.adminToken, `wardPersonId=${ward}`)
    const fatherRow = family.items.find((item) => item.id === fatherGuardianship)
    expect(fatherRow?.isPrimaryPayer).toBe(false)
    const promoted = await updateGuardianship(
      request,
      club.adminToken,
      { id: fatherGuardianship, isPrimaryPayer: true },
      fatherRow?.updatedAt,
    )
    expect(promoted.status).toBe(409)
    expect(promoted.body?.code).toBe('guardianship_primary_payer_conflict')
    expect((await getGuardianship(request, club.adminToken, first)).body?.isPrimaryPayer).toBe(true)

    // Concurrency: two primary payers for a new ward at the same time — exactly one wins.
    const twin = await createPerson(request, club.adminToken, { firstName: 'Ola', lastName: 'Płatnik' })
    const racers = await Promise.all(
      [mother, father].map((guardianPersonId) =>
        call<{ code?: string }>(request, 'POST', '/api/people/guardianships', club.adminToken, {
          data: { guardianPersonId, wardPersonId: twin, isPrimaryPayer: true, validFrom: '2020-01-01' },
        }),
      ),
    )
    expect(racers.map((result) => result.status).sort()).toEqual([201, 409])
    expect(racers.find((result) => result.status === 409)?.body?.code).toBe('guardianship_primary_payer_conflict')
    const twinFamily = await guardianships(request, club.adminToken, `wardPersonId=${twin}`)
    expect(twinFamily.items.filter((item) => item.isPrimaryPayer)).toHaveLength(1)

    // The mother's payer guardianship ends today; from tomorrow the father may be the payer.
    const firstRow = await getGuardianship(request, club.adminToken, first)
    const ended = await endGuardianship(request, club.adminToken, first, firstRow.body?.updatedAt, calendarDate())
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    expect(ended.body?.validTo).toBe(calendarDate())
    family = await guardianships(request, club.adminToken, `wardPersonId=${ward}`)
    const fatherNow = family.items.find((item) => item.id === fatherGuardianship)
    const handover = await updateGuardianship(
      request,
      club.adminToken,
      { id: fatherGuardianship, isPrimaryPayer: true, validFrom: calendarDate(1) },
      fatherNow?.updatedAt,
    )
    expect(handover.status, JSON.stringify(handover.body)).toBe(200)
    // The ended guardianship is still there (ended through valid_to, not deleted).
    expect(family.items.map((item) => item.id)).toContain(first)

    // Undoing the end would make two overlapping payers: the undo is refused with the same 409.
    const endLog = (await actionLogEntries(request, club.adminToken, first)).find(
      (entry) => entry.commandId === 'people.guardianships.end',
    )
    expect(endLog?.undoToken).toBeTruthy()
    const refusedUndo = await undoByToken(request, club.adminToken, String(endLog?.undoToken))
    expect(refusedUndo.status()).toBe(409)
    expect(((await refusedUndo.json()) as { code?: string }).code).toBe('guardianship_primary_payer_conflict')
    expect((await getGuardianship(request, club.adminToken, first)).body?.validTo).toBe(calendarDate())
  } finally {
    await club.cleanup()
  }
})

test('E02-S02 guardianship: relation, consents granted and withdrawn with their dates, edit and its undo, the ward and a former guardian cannot change consents', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s02-consents')
  try {
    const guardian = await createStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Zgodna',
      birthDate: birthDateTurning(41),
    })
    const ward = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Zgodna',
      birthDate: birthDateTurning(16),
    })
    const guardianshipId = await createGuardianship(request, club.adminToken, {
      guardianPersonId: guardian.personId,
      wardPersonId: ward.personId,
      relation: 'grandparent',
      consents: { regulations: true, image: false },
      validFrom: '2020-01-01',
    })
    let row = (await getGuardianship(request, club.adminToken, guardianshipId)).body
    expect(row?.relation).toBe('grandparent')
    expect(row?.isPrimaryPayer).toBe(false)
    // P-08: a consent never granted stays "not granted" when withdrawn; the granted one carries its date and author.
    expect(row?.consents?.image).toEqual({ granted: false, at: null, byPersonId: null })
    expect(row?.consents?.regulations.granted).toBe(true)
    expect(row?.consents?.regulations.byPersonId).toBe(club.adminPersonId)
    const regulationsGrantedAt = row?.consents?.regulations.at

    // The administrator edits the relation and withdraws the regulations consent; granting again later keeps nothing
    // of the old date (a new grant), while re-sending a granted consent keeps its date.
    const edited = await updateGuardianship(
      request,
      club.adminToken,
      { id: guardianshipId, relation: 'legal_guardian', consents: { regulations: false, trips: true } },
      row?.updatedAt,
    )
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    expect(edited.body?.actingRole).toBe('club_admin')
    row = (await getGuardianship(request, club.adminToken, guardianshipId)).body
    expect(row?.relation).toBe('legal_guardian')
    expect(row?.consents?.regulations.granted).toBe(false)
    expect(row?.consents?.regulations.at).not.toBe(regulationsGrantedAt)
    expect(row?.consents?.trips.granted).toBe(true)
    const tripsAt = row?.consents?.trips.at
    const resent = await updateGuardianship(
      request,
      club.adminToken,
      { id: guardianshipId, consents: { trips: true } },
      row?.updatedAt,
    )
    expect(resent.status).toBe(200)
    row = (await getGuardianship(request, club.adminToken, guardianshipId)).body
    expect(row?.consents?.trips.at).toBe(tripsAt)

    // Undo of the relation edit restores the previous relation and consents.
    const updates = (await actionLogEntries(request, club.adminToken, guardianshipId)).filter(
      (entry) => entry.commandId === 'people.guardianships.update',
    )
    // Newest first: undo the re-send (no change), then the edit.
    for (const entry of updates) {
      const undone = await undoByToken(request, club.adminToken, String(entry.undoToken))
      expect(undone.status(), await undone.text()).toBe(200)
    }
    row = (await getGuardianship(request, club.adminToken, guardianshipId)).body
    expect(row?.relation).toBe('grandparent')
    expect(row?.consents?.regulations.granted).toBe(true)
    expect(row?.consents?.trips.granted).toBe(false)

    // The ward (16, with an account) cannot change the consents given for her: 403.
    const wardToken = await signInAs(request, club, ward.userId, ward.email)
    const byWard = await setConsents(request, wardToken, guardianshipId, { image: true }, row?.updatedAt)
    expect(byWard.status).toBe(403)
    // The guardian can, and a stale lock token answers 409.
    const guardianToken = await signInAs(request, club, guardian.userId, guardian.email)
    const byGuardian = await setConsents(request, guardianToken, guardianshipId, { image: true }, row?.updatedAt)
    expect(byGuardian.status, JSON.stringify(byGuardian.body)).toBe(200)
    expect(byGuardian.body?.actingRole).toBe('guardian')
    const stale = await setConsents(request, guardianToken, guardianshipId, { image: false }, row?.updatedAt)
    expect(stale.status).toBe(409)

    // Once the guardianship has ended, its former guardian has no grant over the ward any more (403), and even the
    // administrator cannot change the consents of an ended guardianship (409).
    row = (await getGuardianship(request, club.adminToken, guardianshipId)).body
    const ended = await endGuardianship(request, club.adminToken, guardianshipId, row?.updatedAt, calendarDate(-1))
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const byFormer = await setConsents(request, guardianToken, guardianshipId, { trips: true }, ended.body?.updatedAt)
    expect(byFormer.status).toBe(403)
    const byAdmin = await setConsents(request, club.adminToken, guardianshipId, { trips: true }, ended.body?.updatedAt)
    expect(byAdmin.status).toBe(409)
    expect(byAdmin.body?.code).toBe('guardianship_ended')
  } finally {
    await club.cleanup()
  }
})

test('E02-S02 role assignments: section required (422), no duplicate active assignment (409), expired grants nothing, no account yet, coach without memberships', async ({
  request,
}) => {
  const club = await createClub(request, 'e02-s02-roles')
  try {
    const sectionA = await createStructure(request, club.adminToken, 'sections', { name: 'Basen' })
    const sectionB = await createStructure(request, club.adminToken, 'sections', { name: 'Szachy' })

    // A coordinator assignment without a section → 422 `role_scope_required`.
    const noAccount = await createPerson(request, club.adminToken, {
      firstName: 'Ewa',
      lastName: 'Bezkonta',
      birthDate: birthDateTurning(30),
    })
    const missingScope = await call<{ code?: string }>(
      request,
      'POST',
      '/api/people/role-assignments',
      club.adminToken,
      {
        data: { personId: noAccount, role: 'coordinator', validFrom: '2020-01-01' },
      },
    )
    expect(missingScope.status).toBe(422)
    expect(missingScope.body?.code).toBe('role_scope_required')

    // A person without an account: the coordinator assignment of section A is stored (201), no `auth` role yet.
    const stored = await assignRole(request, club.adminToken, {
      personId: noAccount,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    expect((await getAssignment(request, club.adminToken, stored)).body?.sectionId).toBe(sectionA)
    expect((await getPerson(request, club.adminToken, noAccount)).body?.hasAccount).toBe(false)

    // The same role for the same section again while it is active → 409; overlapping periods count as active, a
    // period after the end of the first does not.
    const duplicate = await call<{ code?: string }>(request, 'POST', '/api/people/role-assignments', club.adminToken, {
      data: { personId: noAccount, role: 'coordinator', sectionId: sectionA, validFrom: calendarDate(30) },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body?.code).toBe('role_assignment_duplicate')
    const concurrent = await Promise.all(
      [0, 1].map(() =>
        call<{ code?: string }>(request, 'POST', '/api/people/role-assignments', club.adminToken, {
          data: { personId: noAccount, role: 'coordinator', sectionId: sectionB, validFrom: '2020-01-01' },
        }),
      ),
    )
    expect(concurrent.map((result) => result.status).sort()).toEqual([201, 409])
    // Another section is a different scope; an update into a duplicate is refused too.
    const bounded = await assignRole(request, club.adminToken, {
      personId: noAccount,
      role: 'coach',
      validFrom: '2020-01-01',
      validTo: '2020-12-31',
    })
    const later = await assignRole(request, club.adminToken, {
      personId: noAccount,
      role: 'coach',
      validFrom: '2021-01-01',
    })
    const laterRow = await getAssignment(request, club.adminToken, later)
    const overlapByUpdate = await call<{ code?: string }>(
      request,
      'PUT',
      '/api/people/role-assignments',
      club.adminToken,
      {
        data: { id: later, validFrom: '2020-06-01' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(laterRow.body?.updatedAt) },
      },
    )
    expect(overlapByUpdate.status).toBe(409)
    expect(overlapByUpdate.body?.code).toBe('role_assignment_duplicate')
    expect((await getAssignment(request, club.adminToken, bounded)).status).toBe(200)

    // An assignment that ended yesterday is inactive and grants nothing; one ending tomorrow is active.
    const coordinator = await createStaff(request, club, {
      firstName: 'Igor',
      lastName: 'Wygasły',
      birthDate: birthDateTurning(45),
    })
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
      validTo: calendarDate(-1),
    })
    await expectRoles(request, club, coordinator.userId, ['vereino_member'])
    const expiredToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    // `vereino_member` alone has no people.view: neither the people list nor the assignments are open to him.
    expect((await roleAssignments(request, expiredToken)).status).toBe(403)
    expect((await getAssignment(request, expiredToken, stored)).status).toBe(403)
    expect((await persons(request, expiredToken)).status).toBe(403)
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: sectionB,
      validFrom: '2020-01-01',
      validTo: calendarDate(1),
    })
    await expectRoles(request, club, coordinator.userId, ['vereino_coordinator', 'vereino_member'])
    const token = await signInAs(request, club, coordinator.userId, coordinator.email)
    const activeView = await roleAssignments(request, token)
    expect(activeView.status).toBe(200)
    expect(activeView.items.map((item) => item.sectionId)).toContain(sectionB)
    // The expired assignment of section A grants nothing: he still sees his own (expired) assignment through `self`,
    // but no other assignment of section A — the other coordinator's stays out of scope.
    const sectionARows = activeView.items.filter((item) => item.sectionId === sectionA)
    expect(sectionARows.length).toBeGreaterThan(0)
    expect(sectionARows.every((item) => item.personId === coordinator.personId)).toBe(true)
    expect(activeView.items.map((item) => item.id)).not.toContain(stored)
    expect((await getAssignment(request, token, stored)).status).toBe(403)

    // A coach assignment without any group membership: the `auth` role is granted, but the coach has no group
    // scope (memberships arrive with #30) — he reads nobody else's records.
    const coach = await createStaff(request, club, {
      firstName: 'Tomek',
      lastName: 'Trener',
      birthDate: birthDateTurning(29),
    })
    await assignRole(request, club.adminToken, { personId: coach.personId, role: 'coach', validFrom: '2020-01-01' })
    await expectRoles(request, club, coach.userId, ['vereino_coach', 'vereino_member'])
    expect(await userRoles(request, club, coach.userId)).not.toContain('vereino_coordinator')
    const coachToken = await signInAs(request, club, coach.userId, coach.email)
    expect((await persons(request, coachToken)).status).toBe(403)
    const coachAssignments = await roleAssignments(request, coachToken)
    expect(coachAssignments.status).toBe(403)
    expect((await getPerson(request, coachToken, noAccount)).status).toBe(403)
  } finally {
    await club.cleanup()
  }
})

test('E02-S02 person pages: list with last-name search, create, the record tabs at 375 px in dark mode; Access denied without people.view', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e02-s02-pages')
  try {
    const marker = `Strona${randomUUID().slice(0, 6)}`
    const ward = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: marker,
      birthDate: birthDateTurning(9),
    })
    // The last-name search goes through the platform's search tokens, which are built after the write.
    await expect
      .poll(async () => (await persons(request, club.adminToken, `&lastName=${marker}`)).items.map((item) => item.id))
      .toEqual([ward])
    // A locator that does not match fails within 30 s instead of waiting for the whole test timeout.
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // Setting the password ends the administrator's earlier sessions: the API calls below use a fresh token.
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })

    // List and search by last name.
    await page.goto('/backend/people/persons')
    await expect(page.getByRole('heading', { level: 1, name: /People|Osoby/ })).toBeVisible()
    await page.getByPlaceholder(/Search by last name|Szukaj po nazwisku/).fill(marker)
    await expect(page.getByRole('link', { name: new RegExp(marker) })).toBeVisible()
    const listOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(listOverflow).toBeLessThanOrEqual(0)

    // Create a person through the form; the record opens with its tabs.
    await page.goto('/backend/people/persons/create')
    // CrudForm labels are not bound to their inputs; its field containers carry `data-crud-field-id`.
    await page.locator('[data-crud-field-id="firstName"] input').fill('Kasia')
    await page.locator('[data-crud-field-id="lastName"] input').fill(marker)
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/people\/persons\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`Kasia ${marker}`) })).toBeVisible()
    for (const name of [/^Details$|^Dane$/, /Guardianship|Opieka/, /^Roles$|^Role$/, /^Account$|^Konto$/]) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
    const recordOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(recordOverflow).toBeLessThanOrEqual(0)
    const kasiaId = page.url().split('/').pop() as string

    // The guardianship tab lists the link made through the API with its consents (the administrator sees them).
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: kasiaId,
      wardPersonId: ward,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: calendarDate(),
    })
    await page.reload()
    await page.getByRole('tab', { name: /Guardianship|Opieka/ }).click()
    await expect(page.getByText(/Primary payer|Główny płatnik/).first()).toBeVisible()
    await expect(page.getByText(/Club regulations|Regulamin klubu/).first()).toBeVisible()

    // The account tab of a 9-year-old explains the age threshold and disables the button.
    await page.goto(`/backend/people/persons/${ward}`)
    await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
    await expect(page.getByText(/Below the account age threshold|Poniżej progu wieku/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toBeDisabled()

    // A member without people.view gets the platform's permission-denied state and no person data.
    const member = await createStaff(request, club, {
      firstName: 'Michal',
      lastName: 'Członek',
      birthDate: birthDateTurning(30),
    })
    await page.context().clearCookies()
    await signInBrowser(page, request, club, member.userId, member.email)
    await page.goto('/backend/people/persons')
    await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
    await page.goto(`/backend/people/persons/${ward}`)
    await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
    await expect(page.getByText(marker)).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
