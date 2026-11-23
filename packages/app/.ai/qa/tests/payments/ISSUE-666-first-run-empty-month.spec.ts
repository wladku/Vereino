import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { zoneInstant } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createPerson, mercato, type Club } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createFee, generate, periodFromNow, type CodedBody } from '../_fixtures/payments'

// ISSUE-666 (fix(payments)): a new club's first automatic run must not record an empty month. The daily job
// (`payments.charges.generate_due`, run through `mercato payments run-job --job generate-charges --now …`) for a club
// with no fee schedules writes no `payments_charge_generations` row and answers `nothing_to_generate`; the next run
// looks at the month again. Once a fee and a roster exist the next run generates the month (one charge), and a run
// after that answers `generated`. A manual generation of a month with no fees still records its empty run.
test.describe.configure({ timeout: 300_000 })

type GenerateRun = CodedBody & {
  outcome: { due: boolean; period: string; reason?: string }
  summary: { id: string; period: string; created: number } | null
}

function generateDue(club: Club, day: string): GenerateRun {
  const result = mercato([
    'payments',
    'run-job',
    '--job',
    'generate-charges',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    zoneInstant(day, '06:00'),
  ]) as GenerateRun | null
  if (!result) throw new Error('[internal] payments run-job generate-charges printed no result')
  return result
}

async function generationsOf(organizationId: string, period: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string; created_count: number }>(
      `select id, created_count from payments_charge_generations
        where organization_id = $1 and period = $2 and deleted_at is null`,
      [organizationId, period],
    )
    return rows
  })
}

test('ISSUE-666 the daily job records no empty month and generates it once fees exist', async ({ request }) => {
  const club = await createClub(request, 'issue-666')
  try {
    const admin = club.adminToken
    const orgId = club.tenant.organizationId
    const today = calendarDate()
    // This run's month is migration B's month (never automatic), so the scenario runs in the next month.
    const month = periodFromNow(1)

    // No fee schedules, no rosters: nothing is recorded, and the next daily run evaluates the month again.
    expect(generateDue(club, `${month}-01`)).toMatchObject({
      outcome: { due: false, period: month, reason: 'nothing_to_generate' },
      summary: null,
    })
    expect(generateDue(club, `${month}-02`).outcome).toMatchObject({ due: false, reason: 'nothing_to_generate' })
    expect(await generationsOf(orgId, month)).toHaveLength(0)

    // The administrator adds a group, a member and a fee: the next daily run generates the month.
    const section = await createStructure(request, admin, 'sections', { name: 'Sekcja biegowa' })
    const group = await createGroup(request, admin, { sectionId: section, name: 'Biegacze', kind: 'team' })
    const runner = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Biegacz',
      birthDate: birthDateTurning(30),
    })
    await addMembership(request, admin, { groupId: group, personId: runner, role: 'participant', validFrom: today })
    await createFee(request, admin, {
      name: 'Biegacze',
      groupId: group,
      period: 'monthly',
      amount: 12000,
      dueDay: 10,
      validFrom: today,
    })
    const generated = generateDue(club, `${month}-03`)
    expect(generated.outcome).toEqual({ due: true, period: month })
    expect(generated.summary).toMatchObject({ period: month, created: 1 })
    expect(generateDue(club, `${month}-04`).outcome).toMatchObject({ due: false, reason: 'generated' })
    expect(await generationsOf(orgId, month)).toEqual([expect.objectContaining({ created_count: 1 })])

    // The manual generation is unchanged: a month without a valid fee records its empty run.
    const pastMonth = periodFromNow(-1)
    const manual = await generate(request, admin, pastMonth)
    expect(manual.status, JSON.stringify(manual.body)).toBe(200)
    expect(manual.body).toMatchObject({ created: 0, skipped: 0 })
    expect(await generationsOf(orgId, pastMonth)).toEqual([expect.objectContaining({ created_count: 0 })])
  } finally {
    await club.cleanup()
  }
})
