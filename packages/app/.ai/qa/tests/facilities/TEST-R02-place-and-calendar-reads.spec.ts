import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createEvent, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createStaff } from '../_fixtures/club'
import {
  create as createStructure,
  getOne,
  signInBrowser,
  switchBrowserUser,
  update,
} from '../_fixtures/club-structure'
import {
  phoneRental,
  postInternalBooking,
  postRental,
  rentalPitch,
  runRequestProbe,
  type CodedError,
} from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { makeMaintainer } from '../_fixtures/maintenance'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Issue #275 (E11-S01), facilities parity spec phase 1, TEST-R02 and the list part of TEST-R12 (DD-R06, DD-R18): every
// facilities picker and list reads places from `GET /api/facilities/options/places`, inside the caller's facilities
// scope, and the calendar carries the place facts and the names of each entry. A complex holds two leaf pitches; an
// external hall stands beside it. The administrator reads every place and every renter's contact; a coach and a
// coordinator read the names but no contact (Q-R22); the attendant of Boisko A reads Boisko A only, with its renters'
// contacts, and gets 403 `scope_denied` for Boisko B; a maintainer without `facilities.view` reads the assigned pitch
// with every new field null. On `/club/places` a coach at 375 px sees only the two pitches with kind, surface and the
// family's count, in English and Polish, light and dark; the attendant's place picker of the log lists Boisko A only.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type PlaceOption = {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  kind: string
  surface: string | null
  isLeaf: boolean
  isExternal: boolean
  capacityGroups: number
  acceptsOnlineRequests: boolean
}

type Entry = {
  id: string
  kind: string
  placeId: string
  label: string | null
  placeName: string | null
  groupName: string | null
  coachName: string | null
  status: string | null
  contact: { name: string | null; phone: string | null } | null
  canOpen: boolean
}

type Calendar = CodedError & {
  places?: Array<PlaceOption & { kind: string | null }>
  entries?: Entry[]
}

type Today = CodedError & { entries?: Array<Record<string, unknown>>; incidents?: unknown[] }

test('TEST-R02 facility place options and calendar fields by role; TEST-R12 the bookable place list', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r02-reads')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()

    // The places: Kompleks Orlik with Boisko A (the fixture's pitch, moved under it) and Boisko B; an external hall.
    const complex = await createStructure(request, admin, 'places', { name: 'Kompleks Orlik', kind: 'complex' })
    const pitchA = setup.pitch
    const current = await getOne(request, admin, 'places', pitchA)
    const moved = await update(
      request,
      admin,
      'places',
      { id: pitchA, parentPlaceId: complex, surface: 'sztuczna trawa' },
      current?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const pitchB = await createStructure(request, admin, 'places', {
      name: 'Boisko B',
      kind: 'pitch',
      surface: 'trawa naturalna',
      parentPlaceId: complex,
      capacityGroups: 2,
    })
    const hall = await createStructure(request, admin, 'places', {
      name: 'Hala miejska',
      kind: 'hall',
      isExternal: true,
    })

    // The people: a coach of Żaki, the attendant of Boisko A, the maintainer of Boisko A.
    const coach = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: pitchA,
    })
    const groundsman = await createStaff(request, club, {
      firstName: 'Zenon',
      lastName: 'Gospodarz',
      birthDate: birthDateTurning(50),
    })
    const maintainer = await makeMaintainer(request, club, groundsman, pitchA)

    // Saturday on Boisko A: a session with its coach, a club booking, a rental with a contact and a held request.
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const session = await createEvent(request, admin, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '10:00'),
      endsAt: zoneInstant(saturday, '11:30'),
      coachPersonId: coach.personId,
    })
    expect(session.status, JSON.stringify(session.body)).toBe(201)
    const booking = await postInternalBooking(request, setup.coordinator, {
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '12:00'),
      endsAt: zoneInstant(saturday, '13:30'),
      sectionId: setup.academy,
      purpose: 'Zebranie zarządu',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const rental = await postRental(
      request,
      admin,
      phoneRental(pitchA, setup.neighbours, zoneInstant(saturday, '15:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const requestId = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: pitchA,
        startsAt: zoneInstant(saturday, '17:00'),
        endsAt: zoneInstant(saturday, '18:30'),
      }).id,
    )

    const options = (token: string) =>
      call<CodedError & { items?: PlaceOption[]; total?: number }>(
        request,
        'GET',
        '/api/facilities/options/places',
        token,
      )
    const window = `from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(addDays(saturday, 1), '00:00'))}`
    const calendar = (token: string, placeId?: string) =>
      call<Calendar>(request, 'GET', `/api/facilities/calendar?${window}${placeId ? `&placeId=${placeId}` : ''}`, token)
    const byKind = (entries: Entry[] | undefined, kind: string) => {
      const found = (entries ?? []).find((entry) => entry.kind === kind)
      expect(found, `an entry of kind ${kind}`).toBeTruthy()
      return found as Entry
    }

    // The option source: the administrator and the coach read the club with the place facts.
    const adminOptions = await options(admin)
    expect(adminOptions.status, JSON.stringify(adminOptions.body)).toBe(200)
    const items = adminOptions.body?.items ?? []
    expect(adminOptions.body?.total).toBe(items.length)
    expect(items.map((item) => item.id).sort()).toEqual([complex, pitchA, pitchB, hall].sort())
    expect(items.find((item) => item.id === pitchA)).toEqual({
      id: pitchA,
      name: 'Boisko A',
      parentId: complex,
      parentName: 'Kompleks Orlik',
      kind: 'pitch',
      surface: 'sztuczna trawa',
      isLeaf: true,
      isExternal: false,
      capacityGroups: 1,
      acceptsOnlineRequests: false,
    })
    expect(items.find((item) => item.id === pitchB)).toMatchObject({ parentId: complex, capacityGroups: 2 })
    expect(items.find((item) => item.id === complex)).toMatchObject({ isLeaf: false, isExternal: false })
    expect(items.find((item) => item.id === hall)).toMatchObject({ isLeaf: true, isExternal: true })
    const coachOptions = await options(coach.token)
    expect(coachOptions.status, JSON.stringify(coachOptions.body)).toBe(200)
    expect((coachOptions.body?.items ?? []).map((item) => item.id).sort()).toEqual(items.map((item) => item.id).sort())
    // The attendant and the maintainer: Boisko A only (negative case for Boisko B).
    for (const token of [attendant.token, maintainer.token]) {
      const scoped = await options(token)
      expect(scoped.status, JSON.stringify(scoped.body)).toBe(200)
      expect((scoped.body?.items ?? []).map((item) => item.id)).toEqual([pitchA])
    }

    // The administrator's calendar of Boisko A: every entry with its place, the session's group and coach, the
    // rental's status and contact.
    const adminDay = await calendar(admin, pitchA)
    expect(adminDay.status, JSON.stringify(adminDay.body)).toBe(200)
    expect(adminDay.body?.places).toEqual([
      expect.objectContaining({
        id: pitchA,
        parentId: complex,
        kind: 'pitch',
        surface: 'sztuczna trawa',
        isExternal: false,
        capacityGroups: 1,
        acceptsOnlineRequests: false,
      }),
    ])
    for (const entry of adminDay.body?.entries ?? []) expect(entry.placeName).toBe('Boisko A')
    expect(byKind(adminDay.body?.entries, 'session')).toMatchObject({
      groupName: 'Żaki',
      coachName: 'Rafał Trener',
      status: null,
      contact: null,
      canOpen: false,
    })
    expect(byKind(adminDay.body?.entries, 'booking')).toMatchObject({ label: 'Zebranie zarządu', contact: null })
    expect(byKind(adminDay.body?.entries, 'rental')).toMatchObject({
      id: rental.body?.id,
      status: 'requested',
      contact: { name: 'Jan Kontakt', phone: '600 000 001' },
      canOpen: true,
    })
    expect(byKind(adminDay.body?.entries, 'request')).toMatchObject({
      id: requestId,
      status: 'pending_approval',
      contact: expect.objectContaining({ name: 'Anna Wnioskująca' }),
      canOpen: true,
    })

    // A coach and a coordinator read the names, never the contact (DD-R18, Q-R22; negative case).
    for (const token of [coach.token, setup.coordinator]) {
      const day = await calendar(token, pitchA)
      expect(day.status, JSON.stringify(day.body)).toBe(200)
      expect(byKind(day.body?.entries, 'session')).toMatchObject({ groupName: 'Żaki', coachName: 'Rafał Trener' })
      for (const kind of ['rental', 'request']) {
        expect(byKind(day.body?.entries, kind)).toMatchObject({ placeName: 'Boisko A', contact: null, canOpen: false })
      }
      expect(byKind(day.body?.entries, 'rental').status).toBe('requested')
    }

    // The coach's club calendar: every place with its facts, every entry named by its place.
    const clubDay = await calendar(coach.token)
    expect(clubDay.status, JSON.stringify(clubDay.body)).toBe(200)
    expect((clubDay.body?.places ?? []).map((place) => place.id).sort()).toEqual(items.map((item) => item.id).sort())
    expect((clubDay.body?.places ?? []).find((place) => place.id === hall)).toMatchObject({ isExternal: true })
    expect((clubDay.body?.entries ?? []).every((entry) => entry.placeName === 'Boisko A')).toBe(true)

    // The attendant of Boisko A: the contacts of their pitch; Boisko B answers 403 `scope_denied` (negative case).
    const attendantDay = await calendar(attendant.token, pitchA)
    expect(attendantDay.status, JSON.stringify(attendantDay.body)).toBe(200)
    expect(byKind(attendantDay.body?.entries, 'rental')).toMatchObject({
      contact: { name: 'Jan Kontakt', phone: '600 000 001' },
      canOpen: true,
    })
    const otherPitch = await calendar(attendant.token, pitchB)
    expect(otherPitch.status, JSON.stringify(otherPitch.body)).toBe(403)
    expect(otherPitch.body?.code).toBe('scope_denied')
    const otherToday = await call<Today>(request, 'GET', `/api/facilities/today?placeId=${pitchB}`, attendant.token)
    expect(otherToday.status, JSON.stringify(otherToday.body)).toBe(403)

    // The maintainer without `facilities.view`: the redaction holds, every new field null.
    const maintainerDay = await calendar(maintainer.token, pitchA)
    expect(maintainerDay.status, JSON.stringify(maintainerDay.body)).toBe(200)
    expect((maintainerDay.body?.entries ?? []).length).toBeGreaterThanOrEqual(4)
    for (const entry of maintainerDay.body?.entries ?? []) {
      expect(entry).toMatchObject({
        label: null,
        placeName: null,
        groupName: null,
        coachName: null,
        status: null,
        contact: null,
        canOpen: false,
      })
    }

    // "Today at the facility" names each entry's place and lists today's incidents for the log's readers.
    const adminToday = await call<Today>(request, 'GET', `/api/facilities/today?placeId=${pitchA}`, admin)
    expect(adminToday.status, JSON.stringify(adminToday.body)).toBe(200)
    expect(Array.isArray(adminToday.body?.incidents)).toBe(true)

    // TEST-R12, the list part: `/club/places` at 375 px shows only the two leaf pitches with kind, surface and count.
    const password = await signInBrowser(page, request, club, coach.userId, coach.email)
    const coachToken = await getAuthToken(request, coach.email, password)
    const me = await getMe(request, coachToken)
    const english = await putMe(request, coachToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/places')
    const list = page.getByTestId('club-places-list')
    await expect(list).toBeVisible()
    await expect(page.getByText(uiText('facilities.places.list.intro'))).toBeVisible()
    await expect(list.locator(':scope > li')).toHaveCount(2)
    await expect(page.getByTestId(`club-places-card-${complex}`)).toHaveCount(0)
    await expect(page.getByTestId(`club-places-card-${hall}`)).toHaveCount(0)
    const cardA = page.getByTestId(`club-places-card-${pitchA}`)
    await expect(cardA).toContainText('Boisko A')
    await expect(cardA).toContainText('Kompleks Orlik')
    const factsA = cardA.getByTestId('club-places-card-count')
    await expect(factsA).toContainText(uiText('facilities.places.placeKind.pitch'))
    await expect(factsA).toContainText('sztuczna trawa')
    await expect(factsA).toHaveAttribute('data-count', /^\d+$/)
    await expect(page.getByTestId(`club-places-card-${pitchB}`).getByTestId('club-places-card-count')).toContainText(
      'trawa naturalna',
    )
    const violations = await scanInColorSchemes(page, testInfo, '/club/places', async () => {
      await expect(page.getByTestId('club-places-list')).toBeVisible()
    })
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expectNoPageOverflow(page)

    const now = await getMe(request, coachToken)
    const polish = await putMe(request, coachToken, { preferredLocale: 'pl' }, now.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club/places')
    await expect(page.getByTestId(`club-places-card-${pitchA}`).getByTestId('club-places-card-count')).toContainText(
      uiText('facilities.places.placeKind.pitch'),
    )
    await expect(page.locator('[data-testid^="club-places-open-"]')).toHaveCount(2)
    await expectNoPageOverflow(page)

    // The exit gate: the attendant's place picker of the log lists Boisko A and nothing else.
    await switchBrowserUser(page, request, club, attendant.userId, attendant.email)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/facilities/logs')
    await page.getByTestId('facilities-logs-place').click()
    await expect(page.getByRole('option', { name: 'Kompleks Orlik › Boisko A' })).toBeVisible()
    await expect(page.getByRole('option', { name: /Boisko B/ })).toHaveCount(0)
    await expect(page.getByTestId('facilities-logs-place-error')).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
