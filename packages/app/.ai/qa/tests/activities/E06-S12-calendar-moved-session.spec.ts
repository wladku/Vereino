import { expect, test } from '@playwright/test'
import { addDays, createEvent, scheduleFor, zoneInstant } from '../_fixtures/activities'
import { calendarItems, startNow } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'

// Regression for the coordinator calendar (E06-S12, #94; `GET /api/activities/calendar`): a moved session keeps its
// slot (`occurrence_date`); the calendar lists it on the day it starts, where the week grid places it by `startAt`, and
// still on its slot. Read by the slot alone, a session moved from next week to today appeared in neither week's grid;
// E06-S12's calendar step failed every Saturday, when "tomorrow" falls in the next Sunday-first week.
test('E06-S12 the calendar lists a moved session on the day it starts as well as on its slot', async ({ request }) => {
  const club = await createClub(request, 'e06-s12-calendar-moved')
  try {
    const { pitch, orliki } = await scheduleFor(request, club)
    const today = calendarDate()
    const slot = addDays(today, 8)
    const created = await createEvent(request, club.adminToken, {
      groupId: orliki,
      type: 'other',
      name: 'Trening przeniesiony',
      placeId: pitch,
      startsAt: zoneInstant(slot, '17:00'),
      endsAt: zoneInstant(slot, '18:00'),
    })
    expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
    const occurrenceId = String(created.body?.occurrenceId)
    await startNow(request, club, occurrenceId)

    const ids = (items: { occurrence: { id: string } }[]) => items.map((item) => item.occurrence.id)
    // `startNow` may move the session up to nine hours back, so the window holds yesterday and today.
    const around = await calendarItems(
      request,
      club.adminToken,
      `as=coordinator&from=${addDays(today, -1)}&to=${today}`,
    )
    expect(ids(around)).toContain(occurrenceId)
    const onSlot = await calendarItems(request, club.adminToken, `as=coordinator&from=${slot}&to=${slot}`)
    expect(ids(onSlot)).toContain(occurrenceId)
  } finally {
    await club.cleanup()
  }
})
