import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { addDays } from '../_fixtures/activities'
import { declare, familyFor, oneOff } from '../_fixtures/attendance'
import {
  calendarDate,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  getPerson,
  mercato,
  type Club,
} from '../_fixtures/club'
import { createGuardianship, getGuardianship, guardianships, setConsents } from '../_fixtures/people'
import { createFee, generate, listCharges, periodFromNow } from '../_fixtures/payments'

// People life-cycle spec phase L8 (#310; REQ-L06, DD-L08, J-L05, AC-L07): TEST-L09 — a ward with an account and two
// guardians (consents given by one, the primary payer with an open charge, a `pending_guardian` declaration of a later
// match), a ward without a birth date and an adult whose guardianship was created after the 18th birthday. The daily
// job `people life-cycle` run 30 days before the birthday twice sends one notice per recipient (guardians, the ward,
// the administrators) under one key each; run on the birthday twice it ends the two guardianships the day before,
// copies the consents with their author and date, makes the declaration final (the `activities` subscriber of
// `people.person.came_of_age`) and sends the came-of-age notice once; the former guardian gets 403 on the adult and no
// ward; the next period's charge names the adult as payer while the earlier one keeps the guardian; the later
// guardianship stays and the ward without a birth date is listed, not changed. A dry run writes nothing.
test.describe.configure({ timeout: 420_000 })

type LifeCycleResult = {
  today: string
  dryRun: boolean
  steps: string[]
  counts: {
    turns18Soon: number
    cameOfAge: number
    guardianshipsEnded: number
    accountAge: number
    accountsClosed: number
    failed: number
  }
  withoutBirthDate: string[]
  cameOfAgePersonIds: string[]
}

function lifeCycle(club: Club, today: string, dryRun = false): LifeCycleResult {
  return mercato([
    'people',
    'life-cycle',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--today',
    today,
    ...(dryRun ? ['--dry-run'] : []),
  ]) as LifeCycleResult
}

/** The person ids each dispatch of `keys` reached, per key. */
async function recipientsByKey(club: Club, keys: string[]): Promise<Map<string, string[]>> {
  return withClient(async (client) => {
    const rows = await client.query<{ key: string; person_id: string | null }>(
      `select d.idempotency_key as key, r.person_id
         from foundation_dispatches d join foundation_deliveries r on r.dispatch_id = d.id
        where d.tenant_id = $1 and d.organization_id = $2 and d.idempotency_key = any($3::text[])`,
      [club.tenant.tenantId, club.tenant.organizationId, keys],
    )
    const result = new Map<string, string[]>()
    for (const row of rows.rows) {
      if (!row.person_id) continue
      const list = result.get(row.key) ?? []
      if (!list.includes(row.person_id)) list.push(row.person_id)
      result.set(row.key, list)
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

async function setBirthDate(club: Club, personId: string, birthDate: string): Promise<void> {
  await withClient((client) =>
    client.query(`update people_persons set birth_date = $3 where tenant_id = $1 and id = $2`, [
      club.tenant.tenantId,
      personId,
      birthDate,
    ]),
  )
}

/** The job runs on past days below: the administrator's role (assigned today by the fixture) must cover them. */
async function backdateRoles(club: Club, personId: string, validFrom: string): Promise<void> {
  await withClient((client) =>
    client.query(`update people_role_assignments set valid_from = $3 where tenant_id = $1 and person_id = $2`, [
      club.tenant.tenantId,
      personId,
      validFrom,
    ]),
  )
}

async function storedConsents(
  club: Club,
  table: 'people_persons' | 'people_guardianships',
  column: string,
  id: string,
) {
  return withClient(async (client) => {
    const rows = await client.query<{ consents: unknown }>(
      `select consents from ${table} where tenant_id = $1 and ${column} = $2 and deleted_at is null`,
      [club.tenant.tenantId, id],
    )
    return rows.rows.map((row) => row.consents)
  })
}

async function guardianshipEnds(club: Club, wardPersonId: string): Promise<Array<string | null>> {
  return withClient(async (client) => {
    const rows = await client.query<{ valid_to: string | null }>(
      `select to_char(valid_to, 'YYYY-MM-DD') as valid_to from people_guardianships
        where tenant_id = $1 and ward_person_id = $2 and deleted_at is null order by guardian_person_id`,
      [club.tenant.tenantId, wardPersonId],
    )
    return rows.rows.map((row) => row.valid_to)
  })
}

async function declarationStatus(club: Club, personId: string, occurrenceId: string): Promise<string | null> {
  return withClient(async (client) => {
    const rows = await client.query<{ declaration_status: string | null }>(
      `select declaration_status from activities_attendances
        where tenant_id = $1 and person_id = $2 and occurrence_id = $3 and deleted_at is null`,
      [club.tenant.tenantId, personId, occurrenceId],
    )
    return rows.rows[0]?.declaration_status ?? null
  })
}

test.describe('TEST-L09: on the 18th birthday the guardianships end, the consents move and new charges name the adult', () => {
  test('notices 30 days ahead and on the day, guardianships, consents, declarations, scope and payer', async ({
    request,
  }) => {
    const club = await createClub(request, 'test-l09-coming-of-age')
    try {
      const admin = club.adminToken
      const family = await familyFor(request, club)
      const coordinator = family.academyCoordinator.token
      const ward = family.elder
      const anna = family.guardian
      // Kuba turns 18 in ten days: still a minor on the match day, so his own declaration waits for a guardian (the
      // policy reads the age on the session's day).
      await setBirthDate(club, ward.personId, birthDateTurning(18, 10))
      await backdateRoles(club, club.adminPersonId, addDays(calendarDate(), -60))

      // A second guardian, reachable by e-mail only.
      const tomasz = await createPerson(request, admin, {
        firstName: 'Tomasz',
        lastName: 'Kowalski',
        birthDate: birthDateTurning(42),
        email: `tomasz.l09.${Date.now().toString(36)}@example.test`,
      })
      await createGuardianship(request, admin, {
        guardianPersonId: tomasz,
        wardPersonId: ward.personId,
        isPrimaryPayer: false,
        validFrom: addDays(calendarDate(), -30),
      })

      // Anna gives the image consent and withdraws trips herself.
      const links = await guardianships(request, admin, `wardPersonId=${ward.personId}`)
      const annaLink = links.items.find((item) => item.guardianPersonId === anna.personId)
      expect(annaLink, links.raw).toBeTruthy()
      const lock = (await getGuardianship(request, admin, String(annaLink?.id))).body?.updatedAt
      const given = await setConsents(request, anna.token, String(annaLink?.id), { image: true, trips: false }, lock)
      expect(given.status, JSON.stringify(given.body)).toBe(200)

      // An adult whose guardianship the administrator created after the 18th birthday (Q-L03) and a ward without a birth date.
      const ewa = await createPerson(request, admin, {
        firstName: 'Ewa',
        lastName: 'Kowalska',
        birthDate: birthDateTurning(20),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: anna.personId,
        wardPersonId: ewa,
        validFrom: calendarDate(),
      })
      const undated = await createPerson(request, admin, { firstName: 'Bez', lastName: 'Daty' })
      await createGuardianship(request, admin, {
        guardianPersonId: anna.personId,
        wardPersonId: undated,
        validFrom: addDays(calendarDate(), -30),
      })

      // The charge of this month names Anna, the primary payer.
      const fee = await createFee(request, admin, {
        name: 'Składka Żaki',
        groupId: family.zaki,
        period: 'monthly',
        amount: 12000,
        dueDay: 28,
        validFrom: addDays(calendarDate(), -60),
      })
      expect((await generate(request, admin, periodFromNow(0))).status).toBe(200)

      // Kuba declares a match in two days: it waits for a guardian.
      const match = await oneOff(request, club, coordinator, {
        groupId: family.zaki,
        placeId: family.pitch,
        name: 'Mecz ligowy',
        type: 'match',
        weekday: 'SA',
        fromDaysAhead: 2,
        start: '11:00',
        end: '12:30',
      })
      const own = await declare(request, ward.token, {
        occurrenceId: match.session.id,
        personId: ward.personId,
        declared: 'yes',
      })
      expect(own.status, JSON.stringify(own.body)).toBe(201)
      expect(own.body?.declarationStatus).toBe('pending_guardian')

      // --- T−30, twice ---
      const tMinus30 = addDays(calendarDate(), 10 - 30)
      const dry = lifeCycle(club, tMinus30, true)
      expect(dry.dryRun).toBe(true)
      expect(dry.counts.turns18Soon).toBe(1)
      expect(await dispatchCount(club, 'people:turns-18-soon:')).toBe(0)
      const first = lifeCycle(club, tMinus30)
      expect(first.steps).toEqual(['turns_18_soon', 'came_of_age', 'account_age', 'departed_accounts'])
      expect(first.counts.turns18Soon).toBe(1)
      expect(first.counts.cameOfAge).toBe(0)
      expect(lifeCycle(club, tMinus30).counts.turns18Soon).toBe(0)
      const soonKey = `people:turns-18-soon:${ward.personId}`
      expect(await dispatchCount(club, soonKey)).toBe(2)
      const soon = await recipientsByKey(club, [soonKey, `${soonKey}:admins`])
      expect([...(soon.get(soonKey) ?? [])].sort()).toEqual([anna.personId, tomasz, ward.personId].sort())
      expect(soon.get(`${soonKey}:admins`)).toEqual([club.adminPersonId])

      // --- The birthday, twice ---
      await setBirthDate(club, ward.personId, birthDateTurning(18, 0))
      const today = calendarDate()
      const dryBirthday = lifeCycle(club, today, true)
      expect(dryBirthday.counts).toMatchObject({ cameOfAge: 1, guardianshipsEnded: 2 })
      expect(await guardianshipEnds(club, ward.personId)).toEqual([null, null])
      const before = await storedConsents(club, 'people_guardianships', 'ward_person_id', ward.personId)
      expect(JSON.stringify(before), 'the guardianship consents before the birthday').toContain('"image"')
      const birthday = lifeCycle(club, today)
      expect(
        JSON.stringify(await storedConsents(club, 'people_persons', 'id', ward.personId)),
        `the adult's consents after the birthday run; guardianships had ${JSON.stringify(before)}`,
      ).toContain('"image"')
      expect(birthday.counts).toMatchObject({ cameOfAge: 1, guardianshipsEnded: 2, failed: 0 })
      expect(birthday.cameOfAgePersonIds).toEqual([ward.personId])
      expect(birthday.withoutBirthDate).toContain(undated)
      const again = lifeCycle(club, today)
      expect(again.counts).toMatchObject({ cameOfAge: 0, guardianshipsEnded: 0 })
      expect(again.withoutBirthDate).toContain(undated)

      // The guardianships end the day before; the later one and the undated ward's stay.
      expect(await guardianshipEnds(club, ward.personId)).toEqual([addDays(today, -1), addDays(today, -1)])
      expect(await guardianshipEnds(club, ewa)).toEqual([null])
      expect(await guardianshipEnds(club, undated)).toEqual([null])

      // One came-of-age notice per recipient.
      const cameKey = `people:came-of-age:${ward.personId}`
      expect(await dispatchCount(club, cameKey)).toBe(2)
      const came = await recipientsByKey(club, [cameKey, `${cameKey}:admins`])
      expect([...(came.get(cameKey) ?? [])].sort()).toEqual([anna.personId, tomasz, ward.personId].sort())

      // The consents show on the adult with their author and date.
      const adult = await getPerson(request, admin, ward.personId)
      expect(adult.status).toBe(200)
      const consents = (
        adult.body as {
          ownConsents?: Record<string, { granted: boolean; at: string | null; byPersonId: string | null }>
        }
      ).ownConsents
      expect(consents?.image).toMatchObject({ granted: true, byPersonId: anna.personId })
      // Withdrawing a consent never given is no decision (P-08): nothing to carry over.
      expect(consents?.trips).toMatchObject({ granted: false, byPersonId: null })
      expect(consents?.regulations.granted).toBe(true)
      expect(consents?.image.at).toBeTruthy()

      // The adult's own profile names the former guardian as the author.
      const me = await call<{ ownConsents?: { image?: { authorName?: string | null } } | null; notice?: unknown }>(
        request,
        'GET',
        '/api/people/me',
        ward.token,
      )
      expect(me.status).toBe(200)
      expect(me.body?.ownConsents).toBeTruthy()
      expect(me.body?.notice).toEqual({ kind: 'came_of_age', on: today })

      // The pending declaration of the later match is final (the `activities` subscriber).
      await expect
        .poll(() => declarationStatus(club, ward.personId, match.session.id), { timeout: 60_000 })
        .toBe('final')

      // The former guardian no longer reads the adult and has no such ward.
      expect((await getPerson(request, anna.token, ward.personId)).status).toBe(403)
      const annaMe = await call<{ wards?: Array<{ personId: string }> }>(request, 'GET', '/api/people/me', anna.token)
      expect(annaMe.status).toBe(200)
      expect((annaMe.body?.wards ?? []).map((item) => item.personId)).not.toContain(ward.personId)

      // The next period's charge names the adult; the earlier one keeps Anna.
      expect((await generate(request, admin, periodFromNow(1))).status).toBe(200)
      const charges = (await listCharges(request, admin, `&personId=${ward.personId}`)).filter(
        (charge) => charge.sourceId === fee,
      )
      const byPeriod = new Map(charges.map((charge) => [charge.periodLabel, charge.payerPersonId]))
      expect(charges, JSON.stringify(charges)).toHaveLength(2)
      expect([...byPeriod.values()].sort()).toEqual([anna.personId, ward.personId].sort())
    } finally {
      await club.cleanup()
    }
  })
})
