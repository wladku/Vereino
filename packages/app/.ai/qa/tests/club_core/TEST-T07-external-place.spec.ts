import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { addDays, createEvent, scheduleFor, zoneInstant } from '../_fixtures/activities'
import {
  OPTIMISTIC_LOCK_HEADER,
  calendarDate,
  call,
  createClub,
  createSecondOrganization,
  mercato,
} from '../_fixtures/club'
import { create, getOne } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'

// TEST-T07 and the external-place part of TEST-T16 (club events spec REQ-T06, DD-T08, AC-T06; issue #377, E14-S02):
// a section coordinator adds a missing venue as an external place — a root, active, external leaf with a name, an
// address, a kind and an owner and nothing else — and every place picker lists it; the same name and address again
// answers 409 `external_place_exists` with the existing id; a coach cannot add one and the coordinator cannot edit or
// delete it; an existing coordinator holds the feature after `auth sync-role-acls`; the undo removes the place while no
// session points at it; another organization's identical place is not a duplicate.
test.describe.configure({ timeout: 300_000 })

type AddedPlace = {
  id?: string
  name?: string
  label?: string
  kind?: string
  address?: string
  ownerInstitutionId?: string | null
  parentId?: string | null
  isExternal?: boolean
  isPublicSchedule?: boolean
  code?: string
  details?: { placeId?: string } | unknown[]
}

type PlaceOption = { id: string; name: string; parentId: string | null; isExternal: boolean; isLeaf: boolean }

const HALL = { name: 'Hala sportowa w Liszkach', address: 'ul. Szkolna 50, Liszki' }

test('TEST-T07 a coordinator adds an external place once; it stays on the list and stays the administrator’s', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t07')
  try {
    const admin = club.adminToken
    const setup = await scheduleFor(request, club)
    const gmina = await create(request, admin, 'institutions', { name: 'Gmina Liszki', type: 'municipality' })

    // An existing coordinator holds the new feature after the release's role sync (exit gate of phase 2).
    mercato(['auth', 'sync-role-acls', '--tenant', club.tenant.tenantId])
    const wojtek = setup.coordinator
    const addPlace = (token: string, data: Record<string, unknown>) =>
      call<AddedPlace>(request, 'POST', '/api/club_core/places/external', token, { data })

    const added = await addPlace(wojtek, { ...HALL, ownerInstitutionId: gmina })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    expect(added.body).toMatchObject({
      name: HALL.name,
      label: HALL.name,
      kind: 'other',
      address: HALL.address,
      ownerInstitutionId: gmina,
      parentId: null,
      isExternal: true,
      isPublicSchedule: false,
    })
    const hallId = String(added.body?.id)

    // The stored place took the defaults of every field the coordinator cannot set.
    const stored = await getOne(request, admin, 'places', hallId)
    expect(stored).toMatchObject({
      id: hallId,
      name: HALL.name,
      kind: 'other',
      parentPlaceId: null,
      ownerInstitutionId: gmina,
      capacityGroups: 1,
      contacts: [],
      openingHours: null,
    })
    expect(stored).toMatchObject({
      address: HALL.address,
      isExternal: true,
      managedByClub: false,
      rentedByClub: false,
      isActive: true,
      isPublicSchedule: false,
      acceptsOnlineRequests: false,
      publicSlug: null,
    })

    // Every place picker lists it, marked external.
    const options = await call<{ items?: PlaceOption[] }>(request, 'GET', '/api/club_core/options/places', wojtek)
    expect(options.status).toBe(200)
    expect(options.body?.items?.find((item) => item.id === hallId)).toMatchObject({
      name: HALL.name,
      parentId: null,
      isExternal: true,
      isLeaf: true,
    })
    // The event form's options (`/api/activities/events/options`) offer it as a bookable leaf too.
    const eventOptions = await call<{ places?: { id: string; label: string; isExternal: boolean }[] }>(
      request,
      'GET',
      '/api/activities/events/options',
      wojtek,
    )
    expect(eventOptions.status, JSON.stringify(eventOptions.body)).toBe(200)
    expect(eventOptions.body?.places).toContainEqual({ id: hallId, label: HALL.name, isExternal: true })

    // The same name and address — other case, spaces around — is the existing place (negative case).
    const again = await addPlace(wojtek, { name: '  hala SPORTOWA w liszkach ', address: 'UL. SZKOLNA 50, LISZKI ' })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('external_place_exists')
    expect(again.body?.details).toEqual({ placeId: hallId, pickable: true })
    // The same name at another address is another venue.
    const otherAddress = await addPlace(wojtek, { name: HALL.name, address: 'ul. Szkolna 5, Liszki' })
    expect(otherAddress.status, JSON.stringify(otherAddress.body)).toBe(201)
    // A place no picker lists — inactive, or divided into sub-places — is still the duplicate, but not pickable.
    const archived = await create(request, admin, 'places', {
      name: 'Stara hala',
      kind: 'hall',
      address: 'ul. Długa 1, Liszki',
      isActive: false,
    })
    const archivedAgain = await addPlace(wojtek, { name: 'Stara hala', address: 'ul. Długa 1, Liszki' })
    expect(archivedAgain.status, JSON.stringify(archivedAgain.body)).toBe(409)
    expect(archivedAgain.body?.details).toEqual({ placeId: archived, pickable: false })
    const complex = await create(request, admin, 'places', {
      name: 'Kompleks',
      kind: 'complex',
      address: 'ul. Polna 2',
    })
    await create(request, admin, 'places', { name: 'Kort 1', kind: 'pitch', parentPlaceId: complex })
    const complexAgain = await addPlace(wojtek, { name: 'kompleks', address: 'ul. polna 2' })
    expect(complexAgain.status, JSON.stringify(complexAgain.body)).toBe(409)
    expect(complexAgain.body?.details).toEqual({ placeId: complex, pickable: false })

    // Field rules: the lengths, a known kind, no other field, a live owner of the club.
    for (const data of [
      { name: 'H', address: HALL.address },
      { name: 'Hala na Woli', address: 'ul.' },
      { name: 'Hala na Woli', address: HALL.address, kind: 'stadium' },
      { name: 'Hala na Woli', address: HALL.address, isPublicSchedule: true },
      { name: 'Hala na Woli', address: HALL.address, parentPlaceId: setup.pitch },
    ]) {
      const refused = await addPlace(wojtek, data)
      expect(refused.status, `${JSON.stringify(data)} ${JSON.stringify(refused.body)}`).toBe(400)
    }
    const ghostOwner = await addPlace(wojtek, {
      name: 'Hala na Woli',
      address: 'ul. Wolska 1, Kraków',
      ownerInstitutionId: '00000000-0000-4000-8000-000000000001',
    })
    expect(ghostOwner.status, JSON.stringify(ghostOwner.body)).toBe(422)
    expect(ghostOwner.body?.code).toBe('place_reference_invalid')

    // A coach cannot add a place; the coordinator cannot edit or delete it (negative cases).
    const coach = await signedInStaff(request, club, { firstName: 'Kamil', lastName: 'Trener', role: 'coach' })
    const byCoach = await addPlace(coach.token, { name: 'Boisko w Skawinie', address: 'ul. Piłsudskiego 1, Skawina' })
    expect(byCoach.status, JSON.stringify(byCoach.body)).toBe(403)
    const edit = await call(request, 'PUT', '/api/club_core/places', wojtek, {
      data: { id: hallId, name: 'Hala w Liszkach' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(stored?.updatedAt) },
    })
    expect(edit.status, JSON.stringify(edit.body)).toBe(403)
    const removal = await call(request, 'DELETE', `/api/club_core/places?id=${hallId}`, wojtek)
    expect(removal.status, JSON.stringify(removal.body)).toBe(403)
    expect((await getOne(request, admin, 'places', hallId))?.name).toBe(HALL.name)

    // The administrator adds one too (`club_core.*`); the command is audited under its own id.
    const pavilion = await addPlace(admin, { name: 'Pawilon w Tyńcu', address: 'ul. Benedyktyńska 37, Kraków' })
    expect(pavilion.status, JSON.stringify(pavilion.body)).toBe(201)
    const pavilionId = String(pavilion.body?.id)
    const pavilionLog = (await actionLogEntries(request, admin, pavilionId)).find(
      (entry) => entry.commandId === 'club_core.places.add_external',
    )
    expect(pavilionLog?.undoToken, 'the added place is in the audit log and undoable').toBeTruthy()

    // A session at a place blocks the undo; an unused place is removed by it.
    const tournamentDay = addDays(calendarDate(), 10)
    const tournament = await createEvent(request, wojtek, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Turniej w Tyńcu',
      placeId: pavilionId,
      startsAt: zoneInstant(tournamentDay, '09:00'),
      endsAt: zoneInstant(tournamentDay, '13:00'),
    })
    expect(tournament.status, JSON.stringify(tournament.body)).toBe(201)
    const blocked = await undoByToken(request, admin, String(pavilionLog?.undoToken))
    expect(blocked.status(), await blocked.text()).toBe(409)
    expect(((await blocked.json()) as { code?: string }).code).toBe('place_in_use')
    expect((await getOne(request, admin, 'places', pavilionId))?.id).toBe(pavilionId)

    // A sub-place the administrator put under an added place blocks its undo: it is never orphaned.
    const yard = await addPlace(admin, { name: 'Dziedziniec w Tyńcu', address: 'ul. Benedyktyńska 39, Kraków' })
    expect(yard.status, JSON.stringify(yard.body)).toBe(201)
    const yardId = String(yard.body?.id)
    const corner = await create(request, admin, 'places', { name: 'Narożnik', kind: 'pitch', parentPlaceId: yardId })
    const yardLog = (await actionLogEntries(request, admin, yardId)).find(
      (entry) => entry.commandId === 'club_core.places.add_external',
    )
    const yardUndo = await undoByToken(request, admin, String(yardLog?.undoToken))
    expect(yardUndo.status(), await yardUndo.text()).toBe(409)
    expect(((await yardUndo.json()) as { code?: string }).code).toBe('place_has_children')
    expect((await getOne(request, admin, 'places', corner))?.parentPlaceId).toBe(yardId)

    const shed = await addPlace(admin, { name: 'Szopa w Tyńcu', address: 'ul. Benedyktyńska 40, Kraków' })
    expect(shed.status, JSON.stringify(shed.body)).toBe(201)
    const shedId = String(shed.body?.id)
    const shedLog = (await actionLogEntries(request, admin, shedId)).find(
      (entry) => entry.commandId === 'club_core.places.add_external',
    )
    const undone = await undoByToken(request, admin, String(shedLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const afterUndo = await call<{ items?: PlaceOption[] }>(request, 'GET', '/api/club_core/options/places', admin)
    expect(afterUndo.body?.items?.some((item) => item.id === shedId)).toBe(false)

    // TEST-T16: another organization's identical place is no duplicate and never shows on this club's list.
    const other = await createSecondOrganization(request, club)
    const elsewhere = await addPlace(other.adminToken, HALL)
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(201)
    const otherId = String(elsewhere.body?.id)
    expect(otherId).not.toBe(hallId)
    const ours = await call<{ items?: PlaceOption[] }>(request, 'GET', '/api/club_core/options/places', wojtek)
    expect(ours.body?.items?.some((item) => item.id === otherId)).toBe(false)
  } finally {
    await club.cleanup()
  }
})
