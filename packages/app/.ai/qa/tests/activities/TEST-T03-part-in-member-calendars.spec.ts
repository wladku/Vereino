import { expect, test } from '@playwright/test'
import {
  calendarItems,
  declare,
  entryOf,
  familyFor,
  readCalendarItem,
  type CalendarEntry,
} from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { makePublic, partFamily } from '../_fixtures/club-events'
import { passDeadline } from '../_fixtures/declaration-links'
import { publish } from '../_fixtures/publication'

// Club events spec TEST-T03 (REQ-T03, AC-T04; #382): a part is seen only through its group. The guardian of the Żaki
// wards reads in her calendar only the Żaki part of the club event, with `clubEvent.name` and `publicPath` null while
// the event is not public, and the public path once the event and the club page are; Ola, a participant of another
// group, reads no part. The guardian confirms before the deadline and is refused after it (409
// `declaration_deadline_passed`); the group's coach reads his part with `mayEdit: false` and `mayCancel: false`.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type ClubEventLine = { id: string; name: string; publicPath: string | null } | null
const clubEventOf = (entry: CalendarEntry) => (entry.occurrence as { clubEvent?: ClubEventLine }).clubEvent ?? null

test('TEST-T03 a guardian and a participant see only their own part with its club event; the deadline holds; the coach may neither edit nor cancel it', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t03')
  try {
    const family = await familyFor(request, club)
    const { eventId, day, ola, zakiPart, trampkarzPart } = await partFamily(request, club, family)
    const zakiSession = String(zakiPart.occurrenceId)
    const window = `from=${calendarDate()}&to=${day}`

    // --- The guardian: only the Żaki part, named with its event, without a link while not public ---
    const guardianItems = await calendarItems(request, family.guardian.token, `${window}&as=guardian`)
    const parts = guardianItems.filter((entry) => clubEventOf(entry) !== null)
    expect(parts.map((entry) => entry.occurrence.id)).toEqual([zakiSession])
    expect(guardianItems.some((entry) => entry.occurrence.id === trampkarzPart.occurrenceId)).toBe(false)
    const part = entryOf(guardianItems, zakiSession)
    expect(clubEventOf(part)).toEqual({ id: eventId, name: 'PRZYKŁAD CUP 2026', publicPath: null })
    expect(part.occurrence.invitedTeamNames).toEqual(
      expect.arrayContaining(['Wisła Brzezie', 'Orzeł Brzozów', 'UKS Sąsiedni']),
    )
    expect(part.declarationKind).toBe('confirm')

    // --- Ola, a participant of the pool group only: nothing of the tournament ---
    const olaItems = await calendarItems(request, ola.token, `${window}&as=self`)
    expect(olaItems.filter((entry) => clubEventOf(entry) !== null)).toEqual([])

    // --- Public: the event and the club page with its Events menu; the line carries the public path ---
    const eventSlug = await makePublic(request, family.academyCoordinator.token, eventId)
    const settings = await publish(request, club.adminToken, `t03-${Date.now().toString(36)}`, ['events'])
    const published = await readCalendarItem(request, family.guardian.token, zakiSession, 'as=guardian')
    expect(published.status, JSON.stringify(published.body)).toBe(200)
    expect(clubEventOf(published.body as CalendarEntry)).toEqual({
      id: eventId,
      name: 'PRZYKŁAD CUP 2026',
      publicPath: `/p/${String(settings.publicSlug)}/events/${eventSlug}`,
    })

    // --- The deadline: confirmed before it, refused after it ---
    const before = await declare(request, family.guardian.token, {
      occurrenceId: zakiSession,
      personId: family.younger.personId,
      declared: 'yes',
    })
    expect(before.status, JSON.stringify(before.body)).toBe(201)
    await passDeadline(zakiSession)
    const after = await declare(request, family.guardian.token, {
      occurrenceId: zakiSession,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(after.status, JSON.stringify(after.body)).toBe(409)
    expect((after.body as { code?: string }).code).toBe('declaration_deadline_passed')

    // --- The group's coach: his part, without Edit and Cancel ---
    const coachItems = await calendarItems(request, family.coach.token, `${window}&as=coach`)
    expect(clubEventOf(entryOf(coachItems, zakiSession))?.name).toBe('PRZYKŁAD CUP 2026')
    const coachEntry = await readCalendarItem(request, family.coach.token, zakiSession, 'as=coach')
    expect(coachEntry.status, JSON.stringify(coachEntry.body)).toBe(200)
    expect(coachEntry.body).toMatchObject({ mayEdit: false, mayCancel: false })
  } finally {
    await club.cleanup()
  }
})
