import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  getAssignment,
  getPerson,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure, getOne, list } from '../_fixtures/club-structure'
import {
  createGuardianship,
  getGuardianship,
  guardianships,
  persons,
  roleAssignments,
  setConsents,
} from '../_fixtures/people'

// TEST-002 (club spec, security; REQ-001, REQ-003): two tenants; a coordinator and a member of the first club read and
// write people, sections and places outside their scope — 403/404 everywhere, and nothing of the second club (or of
// sections they do not coordinate) leaks through lists or search. The coordinator reads the club's people records
// club-wide, basic data only (#26); everything else stays in his section.
test.describe.configure({ timeout: 360_000 })

test('TEST-002 a coordinator and a member get 403/404 outside their scope, with no leakage in lists or search', async ({
  request,
}) => {
  const first = await createClub(request, 'test-002-first')
  const second = await createClub(request, 'test-002-second')
  try {
    const foreignMarker = `Obcy${randomUUID().slice(0, 8)}`
    // The second club: a family, a section with a coordinator assignment, a place.
    const foreignGuardian = await createPerson(request, second.adminToken, {
      firstName: 'Anna',
      lastName: foreignMarker,
      email: 'anna-obca@example.org',
    })
    const foreignWard = await createPerson(request, second.adminToken, {
      firstName: 'Antek',
      lastName: foreignMarker,
      birthDate: birthDateTurning(10),
    })
    const foreignGuardianship = await createGuardianship(request, second.adminToken, {
      guardianPersonId: foreignGuardian,
      wardPersonId: foreignWard,
      isPrimaryPayer: true,
      consents: { image: true },
      validFrom: '2020-01-01',
    })
    const foreignSection = await createStructure(request, second.adminToken, 'sections', {
      name: `${foreignMarker} sekcja`,
    })
    const foreignAssignment = await assignRole(request, second.adminToken, {
      personId: foreignGuardian,
      role: 'coordinator',
      sectionId: foreignSection,
      validFrom: '2020-01-01',
    })
    const foreignPlace = await createStructure(request, second.adminToken, 'places', {
      name: `${foreignMarker} boisko`,
      kind: 'pitch',
    })

    // The first club: sections A and B, a place, a family, a coordinator of A and a member.
    const sectionA = await createStructure(request, first.adminToken, 'sections', { name: 'Akademia' })
    const sectionB = await createStructure(request, first.adminToken, 'sections', { name: 'Basen' })
    await createStructure(request, first.adminToken, 'places', { name: 'Orlik', kind: 'pitch' })
    const coordinator = await createStaff(request, first, {
      firstName: 'Celina',
      lastName: 'Koordynatorka',
      birthDate: birthDateTurning(36),
    })
    await assignRole(request, first.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    const otherCoordinator = await createPerson(request, first.adminToken, {
      firstName: 'Bogdan',
      lastName: 'Basenowy',
    })
    const assignmentB = await assignRole(request, first.adminToken, {
      personId: otherCoordinator,
      role: 'coordinator',
      sectionId: sectionB,
      validFrom: '2020-01-01',
    })
    const parent = await createPerson(request, first.adminToken, { firstName: 'Kasia', lastName: 'Rodzic' })
    const child = await createPerson(request, first.adminToken, {
      firstName: 'Jaś',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(9),
    })
    const familyGuardianship = await createGuardianship(request, first.adminToken, {
      guardianPersonId: parent,
      wardPersonId: child,
      consents: { regulations: true },
      validFrom: calendarDate(),
    })
    const member = await createStaff(request, first, {
      firstName: 'Michal',
      lastName: 'Członek',
      birthDate: birthDateTurning(30),
    })
    const coordinatorToken = await signInAs(request, first, coordinator.userId, coordinator.email)
    const memberToken = await signInAs(request, first, member.userId, member.email)

    // --- Coordinator of section A ---
    // People: the first club only (club-wide, basic data), nothing of the second club, also through the last-name search.
    const people = await persons(request, coordinatorToken)
    expect(people.status).toBe(200)
    expect(people.items.map((item) => item.id)).toEqual(expect.arrayContaining([parent, child, otherCoordinator]))
    expect(people.raw).not.toContain(foreignMarker)
    for (const id of [foreignGuardian, foreignWard]) expect(people.raw).not.toContain(id)
    const searched = await persons(request, coordinatorToken, `&lastName=${foreignMarker}`)
    expect(searched.status).toBe(200)
    expect(searched.items).toEqual([])
    expect((await persons(request, coordinatorToken, `&ids=${foreignGuardian},${foreignWard}`)).items).toEqual([])
    expect((await getPerson(request, coordinatorToken, foreignGuardian)).status).toBe(404)
    // Guardianships: the first club only, never with consents for the coordinator role.
    const families = await guardianships(request, coordinatorToken, '')
    expect(families.status).toBe(200)
    expect(families.items.map((item) => item.id)).toEqual([familyGuardianship])
    expect(families.raw).not.toContain('consents')
    expect((await getGuardianship(request, coordinatorToken, foreignGuardianship)).status).toBe(404)
    // Role assignments: section A only; section B → 403, the second club → 404.
    const assignments = await roleAssignments(request, coordinatorToken)
    expect(new Set(assignments.items.map((item) => item.sectionId))).toEqual(new Set([sectionA]))
    const deniedB = await getAssignment(request, coordinatorToken, assignmentB)
    expect(deniedB.status).toBe(403)
    expect(deniedB.body?.code).toBe('scope_denied')
    expect((await getAssignment(request, coordinatorToken, foreignAssignment)).status).toBe(404)
    // Sections: his own only; places: none (the club administrator's); nothing of the second club.
    const sections = await list(request, coordinatorToken, 'sections')
    expect(sections.status).toBe(200)
    expect(sections.items.map((item) => item.id)).toEqual([sectionA])
    expect(await getOne(request, coordinatorToken, 'sections', foreignSection)).toBeUndefined()
    const places = await list(request, coordinatorToken, 'places')
    expect(places.status).toBe(200)
    expect(places.items).toEqual([])
    expect(await getOne(request, coordinatorToken, 'places', foreignPlace)).toBeUndefined()
    // Writes: no people.manage, people.roles.manage or club_core.manage → 403; consents of a family he is not a
    // guardian of → 403 `scope_denied`.
    const childDetail = await getPerson(request, first.adminToken, child)
    const familyDetail = await getGuardianship(request, first.adminToken, familyGuardianship)
    const sectionADetail = await getOne(request, first.adminToken, 'sections', sectionA)
    const coordinatorWrites: [string, string, Record<string, unknown>, string | null | undefined][] = [
      ['POST', '/api/people/persons', { firstName: 'Nowy', lastName: 'Człowiek' }, null],
      ['PUT', '/api/people/persons', { id: child, firstName: 'Janek' }, String(childDetail.body?.updatedAt)],
      ['PUT', '/api/people/persons', { id: foreignWard, firstName: 'Janek' }, String(childDetail.body?.updatedAt)],
      ['POST', '/api/people/role-assignments', { personId: child, role: 'coach', validFrom: '2020-01-01' }, null],
      [
        'POST',
        '/api/people/guardianships',
        { guardianPersonId: parent, wardPersonId: coordinator.personId, validFrom: '2020-01-01' },
        null,
      ],
      ['PUT', '/api/club_core/sections', { id: sectionA, name: 'Przejęta' }, sectionADetail?.updatedAt],
      ['PUT', '/api/club_core/sections', { id: foreignSection, name: 'Przejęta' }, sectionADetail?.updatedAt],
      ['POST', '/api/club_core/places', { name: 'Nowe boisko', kind: 'pitch' }, null],
    ]
    for (const [method, url, data, lock] of coordinatorWrites) {
      const result = await call(request, method, url, coordinatorToken, {
        data,
        headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
      })
      expect(result.status, `${method} ${url} ${JSON.stringify(data)}`).toBe(403)
    }
    const consents = await setConsents(
      request,
      coordinatorToken,
      familyGuardianship,
      { regulations: false },
      familyDetail.body?.updatedAt,
    )
    expect(consents.status).toBe(403)
    expect(consents.body?.code).toBe('scope_denied')
    expect(
      (
        await setConsents(
          request,
          coordinatorToken,
          foreignGuardianship,
          { image: false },
          familyDetail.body?.updatedAt,
        )
      ).status,
    ).toBe(404)
    // The platform's global search is not open to Vereino roles.
    const globalSearch = await call(request, 'GET', `/api/search/search?q=${foreignMarker}`, coordinatorToken)
    expect(globalSearch.status).toBe(403)

    // --- Member (an account, no staff role) ---
    for (const url of [
      '/api/people/persons',
      `/api/people/persons?lastName=${foreignMarker}`,
      `/api/people/persons/${child}`,
      '/api/people/guardianships',
      `/api/people/guardianships/${familyGuardianship}`,
      '/api/people/role-assignments',
      '/api/club_core/sections',
      '/api/club_core/places',
      `/api/search/search?q=${foreignMarker}`,
    ]) {
      const result = await call(request, 'GET', url, memberToken)
      expect(result.status, `GET ${url}`).toBe(403)
      expect(JSON.stringify(result.body)).not.toContain(foreignMarker)
      expect(JSON.stringify(result.body)).not.toContain('Rodzic')
    }
    const memberWrites: [string, string, Record<string, unknown>][] = [
      ['POST', '/api/people/persons', { firstName: 'Nowy', lastName: 'Człowiek' }],
      ['PUT', '/api/people/persons', { id: child, firstName: 'Janek' }],
      [
        'POST',
        '/api/people/guardianships',
        { guardianPersonId: member.personId, wardPersonId: child, validFrom: '2020-01-01' },
      ],
      [
        'POST',
        '/api/people/role-assignments',
        { personId: member.personId, role: 'club_admin', validFrom: '2020-01-01' },
      ],
      ['POST', '/api/club_core/sections', { name: 'Moja sekcja' }],
      ['POST', '/api/club_core/places', { name: 'Moje boisko', kind: 'pitch' }],
    ]
    for (const [method, url, data] of memberWrites) {
      const result = await call(request, method, url, memberToken, {
        data,
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(childDetail.body?.updatedAt) },
      })
      expect(result.status, `${method} ${url}`).toBe(403)
    }
    // The member holds people.self, which opens the consents route, but he is no guardian: 403 `scope_denied`.
    const memberConsents = await setConsents(
      request,
      memberToken,
      familyGuardianship,
      { regulations: false },
      familyDetail.body?.updatedAt,
    )
    expect(memberConsents.status).toBe(403)
    expect(
      (await getGuardianship(request, first.adminToken, familyGuardianship)).body?.consents?.regulations.granted,
    ).toBe(true)

    // --- The first club's administrator against the second club ---
    expect((await getPerson(request, first.adminToken, foreignGuardian)).status).toBe(404)
    expect((await getGuardianship(request, first.adminToken, foreignGuardianship)).status).toBe(404)
    const adminList = await persons(request, first.adminToken)
    expect(adminList.raw).not.toContain(foreignMarker)
    const adminFamilies = await guardianships(request, first.adminToken, `personId=${foreignWard}`)
    expect(adminFamilies.items).toEqual([])
    const crossWrite = await call(request, 'PUT', '/api/people/persons', first.adminToken, {
      data: { id: foreignWard, firstName: 'Przejęty' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(childDetail.body?.updatedAt) },
    })
    expect([403, 404]).toContain(crossWrite.status)
    const crossGuardianship = await call(request, 'POST', '/api/people/guardianships', first.adminToken, {
      data: { guardianPersonId: parent, wardPersonId: foreignWard, validFrom: '2020-01-01' },
    })
    expect(crossGuardianship.status).toBe(404)
    const crossAssignment = await call(request, 'POST', '/api/people/role-assignments', first.adminToken, {
      data: { personId: foreignGuardian, role: 'coach', validFrom: '2020-01-01' },
    })
    expect(crossAssignment.status).toBe(404)
    const crossConsents = await setConsents(
      request,
      first.adminToken,
      foreignGuardianship,
      { image: false },
      familyDetail.body?.updatedAt,
    )
    expect(crossConsents.status).toBe(404)
    // The second club's records are unchanged.
    const foreignAfter = await getPerson(request, second.adminToken, foreignWard)
    expect(foreignAfter.body?.firstName).toBe('Antek')
    expect((await getGuardianship(request, second.adminToken, foreignGuardianship)).body?.consents?.image.granted).toBe(
      true,
    )
  } finally {
    await second.cleanup()
    await first.cleanup()
  }
})
