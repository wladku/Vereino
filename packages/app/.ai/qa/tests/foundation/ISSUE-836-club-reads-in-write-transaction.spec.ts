import { expect, test } from '@playwright/test'
import { addDays, postActivity, scheduleFor } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { personVersion, putMedical } from '../_fixtures/medical'

// ISSUE-836 (issue #836, follow-up of #728 and #549): after #728 the scope was read on the write transaction's own
// connection, but other reads inside the transaction still went through a second pooled connection: the club clock
// (`clubClock` / `clubToday` → `clubCoreSettings.get` on a fork of the root EntityManager) and the platform RBAC check.
// The ephemeral app runs with `DB_POOL_MAX=20`, so about 20 concurrent writes of such a command each held one
// connection and waited for a second until the acquire timeout. Fifty concurrent writes of three of them all succeed:
// - `activities.activities.create` reads the club clock in its transaction;
// - `payments.charges.create_manual` reads the club clock in its transaction;
// - `people.persons.medical.set` reads the club clock and checks `people.medical.manage` in its transaction.
test.describe.configure({ timeout: 300_000 })

const WRITES = 50

type Outcome = { status: number; body: unknown }

function failuresOf(results: Outcome[], expected: number): string[] {
  return results
    .filter((result) => result.status !== expected)
    .map((result) => `${String(result.status)} ${JSON.stringify(result.body)}`)
}

test('ISSUE-836 fifty concurrent writes of commands that read the club clock or RBAC in their transaction succeed', async ({
  request,
}) => {
  const club = await createClub(request, 'issue-836')
  try {
    const admin = club.adminToken
    const { zaki } = await scheduleFor(request, club)
    const today = calendarDate()

    // activities.activities.create: one-off activities at a typed venue (no club place), so nothing conflicts.
    const activities = await Promise.all(
      Array.from({ length: WRITES }, (_, index) =>
        postActivity(request, admin, {
          groupId: zaki,
          name: `Trening równoległy ${String(index + 1)}`,
          type: 'training',
          venue: { name: 'Hala miejska', address: 'ul. Sportowa 1' },
          startsOn: addDays(today, 7 + index),
          startTime: '17:00',
          endTime: '18:00',
        }),
      ),
    )
    expect(failuresOf(activities, 201)).toEqual([])

    // payments.charges.create_manual: fifty charges of one person.
    const payer = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Płatnik',
      birthDate: birthDateTurning(30),
    })
    const charges = await Promise.all(
      Array.from({ length: WRITES }, (_, index) =>
        call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
          data: {
            personId: payer,
            description: `Opłata ${String(index + 1)}`,
            amount: 1_000,
            dueDate: calendarDate(14),
          },
        }),
      ),
    )
    expect(failuresOf(charges, 201)).toEqual([])
    expect(new Set(charges.map((result) => String(result.body?.chargeId))).size).toBe(WRITES)

    // people.persons.medical.set: fifty persons, each written at once by the administrator. Clearing the date needs
    // no consent, and the command still checks `people.medical.manage` and reads the club clock in its transaction.
    const persons: string[] = []
    for (let index = 0; index < WRITES; index += 1) {
      persons.push(
        await createPerson(request, admin, {
          firstName: 'Ola',
          lastName: `Badana ${String(index + 1)}`,
          birthDate: birthDateTurning(25),
        }),
      )
    }
    const versions = await Promise.all(persons.map((id) => personVersion(request, admin, id)))
    const medical = await Promise.all(persons.map((id, index) => putMedical(request, admin, id, null, versions[index])))
    expect(failuresOf(medical, 200)).toEqual([])
  } finally {
    await club.cleanup()
  }
})
