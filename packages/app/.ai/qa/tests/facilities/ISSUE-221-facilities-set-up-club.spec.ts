import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createClub, mercato } from '../_fixtures/club'

// Issue #221 L4 (E08-S02 follow-ups): a club set up before a `facilities` schedule existed — here a club created
// through the API, which runs no `seedDefaults` — gets the rental lifecycle, request expiry and maintenance reminder
// schedules from `facilities set-up-club`; a second run registers nothing twice, and another club is untouched.
test.describe.configure({ timeout: 300_000 })

const JOB_NAMES = ['facilities:expire-requests', 'facilities:maintenance-reminders', 'facilities:rental-lifecycle']

async function schedulesOf(organizationId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ name: string; schedule_value: string; timezone: string | null }>(
      `select name, schedule_value, timezone from scheduled_jobs
        where organization_id = $1 and name like 'facilities:%' and deleted_at is null order by name`,
      [organizationId],
    )
    return rows
  })
}

test('ISSUE-221 facilities set-up-club registers the three schedules of a club once', async ({ request }) => {
  const club = await createClub(request, 'issue-221-set-up')
  const other = await createClub(request, 'issue-221-other')
  try {
    const orgId = club.tenant.organizationId
    const otherBefore = await schedulesOf(other.tenant.organizationId)
    const scope = ['--tenant', club.tenant.tenantId, '--org', orgId]
    for (let run = 0; run < 2; run += 1) {
      expect(mercato(['facilities', 'set-up-club', ...scope])).toEqual({
        schedules: { 'rental-lifecycle': true, 'expire-requests': true, 'maintenance-reminders': true },
      })
    }
    const schedules = await schedulesOf(orgId)
    expect(schedules.map((row) => row.name)).toEqual(JOB_NAMES)
    expect(schedules.find((row) => row.name === 'facilities:rental-lifecycle')?.schedule_value).toBe('15m')
    expect(schedules.find((row) => row.name === 'facilities:expire-requests')?.schedule_value).toBe('15m')
    expect(schedules.find((row) => row.name === 'facilities:maintenance-reminders')).toMatchObject({
      schedule_value: '0 6 * * *',
      timezone: 'Europe/Warsaw',
    })
    expect(await schedulesOf(other.tenant.organizationId)).toEqual(otherBefore)
  } finally {
    await club.cleanup()
    await other.cleanup()
  }
})
