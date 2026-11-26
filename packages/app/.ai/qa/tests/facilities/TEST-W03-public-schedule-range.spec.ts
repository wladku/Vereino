import { expect, test } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { PRIVATE_NAMES, publicPitch, publicSchedule, publicScheduleQuery } from '../_fixtures/public-places'

// TEST-W03 (calendar range switch spec REQ-W03, DD-W07, AC-W02; #784): the public schedule read of a place takes
// optional `from`/`to` next to `month`. A week across two months answers exactly its seven days in one read; 31 days
// are served, 32 answer 400 `public_schedule_range_invalid`, as do an inverted range, one end alone, a day that does not
// exist and a range outside the readable window (last month to a year ahead); `month` wins when both are sent. A
// `from`/`to` read returns for a day exactly what the month read returns, with no name of a renter, a person, a group
// or an event.
test.describe.configure({ timeout: 300_000 })

const INVALID = 'public_schedule_range_invalid'

/** The first day of the month `months` after the month of `date`. */
function firstOfMonth(date: string, months: number): string {
  const [year, month] = date.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  return first.toISOString().slice(0, 10)
}

test('TEST-W03 public schedule from/to: week across months, 31-day cap, invalid ranges, month wins, no names', async ({
  request,
}) => {
  const club = await createClub(request, 'test-w03-public-range')
  try {
    const slug = `test-w03-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)
    const read = (query: string) => publicScheduleQuery(request, slug, setup.placeSlug, query)
    const today = calendarDate()

    // A week across two months: one read, exactly its seven days.
    const nextMonth = firstOfMonth(today, 1)
    const from = addDays(nextMonth, -3)
    const to = addDays(nextMonth, 3)
    const week = await read(`from=${from}&to=${to}`)
    expect(week.status).toBe(200)
    const weekDays = (week.body?.days ?? []) as Array<{ date: string }>
    expect(weekDays.map((day) => day.date)).toEqual(Array.from({ length: 7 }, (_unused, index) => addDays(from, index)))
    expect(week.body?.month).toBe(from.slice(0, 7))
    expect(week.headers['cache-control']).toContain('s-maxage=60')

    // 31 days are served; 32 are not.
    const month31 = await read(`from=${nextMonth}&to=${addDays(nextMonth, 30)}`)
    expect(month31.status).toBe(200)
    expect((month31.body?.days as unknown[]).length).toBe(31)
    for (const query of [
      `from=${nextMonth}&to=${addDays(nextMonth, 31)}`,
      `from=${addDays(nextMonth, 1)}&to=${nextMonth}`,
      `from=${nextMonth}`,
      `to=${nextMonth}`,
      `from=${nextMonth.slice(0, 8)}32&to=${addDays(nextMonth, 3)}`,
      `from=${firstOfMonth(today, -2)}&to=${addDays(firstOfMonth(today, -2), 2)}`,
      `from=${firstOfMonth(today, 13)}&to=${addDays(firstOfMonth(today, 13), 2)}`,
    ]) {
      const refused = await read(query)
      expect(refused.status, query).toBe(400)
      expect(refused.body, query).toMatchObject({ code: INVALID })
    }

    // `month` wins when both are sent.
    const both = await read(`month=${setup.month}&from=${from}&to=${to}`)
    expect(both.status).toBe(200)
    expect(both.body?.month).toBe(setup.month)
    expect((both.body?.days as Array<{ date: string }>)[0].date).toBe(`${setup.month}-01`)

    // The fixture's day: the same states as the month read, and no name anywhere.
    const monthRead = await publicSchedule(request, slug, setup.placeSlug, setup.month)
    const dayRead = await read(`from=${setup.day}&to=${setup.closedDay}`)
    expect(dayRead.status).toBe(200)
    const monthDays = (monthRead.body?.days ?? []) as Array<{ date: string }>
    expect(dayRead.body?.days).toEqual(
      monthDays.filter((day) => day.date === setup.day || day.date === setup.closedDay),
    )
    const text = dayRead.bytes.toString('utf8')
    for (const name of Object.values(PRIVATE_NAMES)) expect(text, name).not.toContain(name)
  } finally {
    await club.cleanup()
  }
})
