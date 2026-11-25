import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { familyFor, memberAccount } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  type Club,
} from '../_fixtures/club'
import { getMe } from '../_fixtures/members'
import { guardianMedicalConsent, putMedical, runMedicalReminders, wardOf } from '../_fixtures/medical'

// Training outlines and medical expiry spec, phase 1 (#682; REQ-O03, DD-O04, AC-O03): TEST-O02 — the daily
// `people:medical-reminders` job sends one in-app notification and one e-mail per threshold — a month before the date
// to the guardians of a minor, on the date to an adult participant — whatever the number of runs; a changed date sends
// nothing for the old date's day; a date 12 months past is cleared (R20).
test.describe.configure({ timeout: 420_000 })

/** The channels each person got for the dispatch of `key`. */
async function deliveries(club: Club, key: string): Promise<Map<string, string[]>> {
  return withClient(async (client) => {
    const rows = await client.query<{ person_id: string | null; channel: string }>(
      `select r.person_id, r.channel
         from foundation_dispatches d join foundation_deliveries r on r.dispatch_id = d.id
        where d.tenant_id = $1 and d.organization_id = $2 and d.idempotency_key = $3`,
      [club.tenant.tenantId, club.tenant.organizationId, key],
    )
    const result = new Map<string, string[]>()
    for (const row of rows.rows) {
      if (!row.person_id) continue
      result.set(row.person_id, [...(result.get(row.person_id) ?? []), row.channel].sort())
    }
    return result
  })
}

async function dispatchCount(club: Club, prefix: string): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(
      `select count(*)::text as count from foundation_dispatches
        where tenant_id = $1 and organization_id = $2 and idempotency_key like $3`,
      [club.tenant.tenantId, club.tenant.organizationId, `${prefix}%`],
    )
    return Number(rows.rows[0]?.count ?? 0)
  })
}

test('TEST-O02 reminders a month before and on the day, once each; a changed date restarts them', async ({
  request,
}) => {
  const club = await createClub(request, 'test-o02')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const ward = family.younger.personId
    const monthAhead = calendarDate(30)

    // The guardian's ward: a date exactly 30 days ahead.
    await guardianMedicalConsent(request, family.guardian.token, ward, true)
    const set = await putMedical(
      request,
      family.guardian.token,
      ward,
      monthAhead,
      (await wardOf(request, family.guardian.token, ward)).medical?.updatedAt ?? null,
    )
    expect(set.status, JSON.stringify(set.body)).toBe(200)

    // An adult participant with an own consent and a date today.
    const adultId = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Dorosla O02',
      birthDate: birthDateTurning(30),
    })
    const adult = await memberAccount(request, club, adultId, 'ewa-o02')
    const me = await getMe(request, adult.token)
    const consented = await call(request, 'PUT', '/api/people/me/consents', adult.token, {
      data: { changes: { medical: true } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((me.body as { person?: { updatedAt?: string } }).person?.updatedAt) },
    })
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    const own = await putMedical(
      request,
      adult.token,
      adultId,
      calendarDate(),
      String((consented.body as { updatedAt?: string }).updatedAt),
    )
    expect(own.status, JSON.stringify(own.body)).toBe(200)

    // Two runs today: one dispatch per threshold, in-app and e-mail to each reachable recipient.
    const first = runMedicalReminders(club, calendarDate())
    expect(first.counts).toMatchObject({ reminded: 2, failed: 0 })
    const second = runMedicalReminders(club, calendarDate())
    expect(second.counts).toMatchObject({ reminded: 0, failed: 0 })
    const expiring = await deliveries(club, `medical:${ward}:${monthAhead}:expiring`)
    expect([...expiring.keys()]).toEqual([family.guardian.personId])
    expect(expiring.get(family.guardian.personId)).toEqual(['email', 'in_app'])
    const expired = await deliveries(club, `medical:${adultId}:${calendarDate()}:expired`)
    expect([...expired.keys()]).toEqual([adultId])
    expect(expired.get(adultId)).toEqual(['email', 'in_app'])
    expect(await dispatchCount(club, 'medical:')).toBe(2)

    // The guardian enters a new date: on the old date's day nothing is sent for it.
    const renewed = await putMedical(
      request,
      family.guardian.token,
      ward,
      calendarDate(400),
      (await wardOf(request, family.guardian.token, ward)).medical?.updatedAt ?? null,
    )
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(200)
    const onOldDay = runMedicalReminders(club, monthAhead)
    expect(onOldDay.counts).toMatchObject({ reminded: 0, failed: 0 })
    expect(await dispatchCount(club, `medical:${ward}:${monthAhead}:expired`)).toBe(0)

    // R20: 12 months and a day after the adult's date, the job clears it.
    const later = runMedicalReminders(club, calendarDate(367))
    expect(later.counts.clearedRetention).toBeGreaterThanOrEqual(1)
    const row = await withClient((client) =>
      client.query<{ cleared: boolean }>(
        `select medical_valid_until is null as cleared from people_persons where tenant_id = $1 and id = $2`,
        [club.tenant.tenantId, adultId],
      ),
    )
    expect(row.rows[0]?.cleared).toBe(true)
  } finally {
    await club.cleanup()
  }
})
