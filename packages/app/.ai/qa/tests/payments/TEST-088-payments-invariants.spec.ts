import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, birthDateTurning, calendarDate, call, createClub, createPerson, type Club } from '../_fixtures/club'
import { acceptCash, getCharge, recordPayment, reversePayment } from '../_fixtures/payments'

// TEST-088 (club spec REQ-043, AC-043, amendment B; engineering standards S10.6; issue #531): the nightly job
// `payments:verify-invariants` recomputes every charge's paid amount and status from its payments and checks that the
// `KP` receipt and `RG` handover numbers are unique and consecutive per club and month.
// - A club whose ledger was written by the commands (manual charges, a transfer and its reversal, two cash acceptances
//   giving KP …/001 and …/002, one of them over two charges) and with handovers RG …/001 and …/002: no alert.
// - One payment row altered by raw SQL: one alert line (`vereino.ops.payments.invariants.drift`) naming the charge id
//   with its stored and expected status; another club's run stays clean.
// - A handover number moved to …/003 by raw SQL: the alert names the gap RG …/002.
// - No run changes a row. The handover rows are seeded directly: cash the administrator accepts is settled at once,
//   so no command hands it over; the job reads only their numbers.
test.describe.configure({ timeout: 300_000 })

const DRIFT_SIGNAL = 'vereino.ops.payments.invariants.drift'

type ChargeDrift = { chargeId: string; kind: string; status: string; expectedStatus: string | null }
type NumberingDrift = { series: string; kind: string; month: string | null; numbers: string[]; count: number }
type VerifyRun = {
  now: string
  counts: { charges: number; receipts: number; handovers: number }
  drift: boolean
  chargeDrifts: ChargeDrift[]
  numberingDrifts: NumberingDrift[]
  heartbeat: string
}

/** Runs the job for `club` through the operator command; returns its result and the alert lines it logged. */
function verify(club: Club): { run: VerifyRun; alerts: string[] } {
  const result = spawnSync(
    'yarn',
    [
      'mercato',
      'payments',
      'run-job',
      '--job',
      'verify-invariants',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
    ],
    { cwd: APP_ROOT, env: process.env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 180_000 },
  )
  if (result.status !== 0)
    throw new Error(`[internal] run-job verify-invariants exited ${String(result.status)}: ${result.stderr}`)
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/)
  const json = result.stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith('{'))
  return { run: JSON.parse(String(json)) as VerifyRun, alerts: lines.filter((line) => line.includes(DRIFT_SIGNAL)) }
}

/** A fingerprint of every payments row the job reads for the club: any changed column changes it. */
async function fingerprint(organizationId: string): Promise<string> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ charges: string; payments: string; handovers: string }>(
      `select
         (select md5(coalesce(string_agg(row_to_json(c)::text, '|' order by c.id), '')) from payments_charges c
           where c.organization_id = $1) as charges,
         (select md5(coalesce(string_agg(row_to_json(p)::text, '|' order by p.id), '')) from payments_payments p
           where p.organization_id = $1) as payments,
         (select md5(coalesce(string_agg(row_to_json(h)::text, '|' order by h.id), '')) from payments_cash_handovers h
           where h.organization_id = $1) as handovers`,
      [organizationId],
    )
    return JSON.stringify(rows[0])
  })
}

async function seedHandover(club: Club, number: string, paymentIds: string[]): Promise<string> {
  const id = randomUUID()
  await withClient(async (client) => {
    await client.query(
      `insert into payments_cash_handovers
         (id, organization_id, tenant_id, number, collector_person_id, amount, payment_ids, created_at, updated_at)
       values ($1, $2, $3, $4, $5, 0, $6::uuid[], now(), now())`,
      [id, club.tenant.organizationId, club.tenant.tenantId, number, club.adminPersonId, paymentIds],
    )
  })
  return id
}

test('TEST-088 the nightly invariant check alerts on a drifted charge or a numbering gap and changes no row', async ({
  request,
}) => {
  const club = await createClub(request, 'test-088')
  const other = await createClub(request, 'test-088-other')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Rachunek',
      birthDate: birthDateTurning(35),
    })
    const addCharge = async (description: string) => {
      const created = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
        data: { personId: adam, description, amount: 10_000, dueDate: calendarDate(7) },
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.chargeId)
    }
    // Cash pays the oldest charge first, so the one paid in full is created before the one paid in two halves.
    const transferred = await addCharge('Opłata za obóz')
    const fullyPaid = await addCharge('Opłata za strój')
    const halfPaid = await addCharge('Opłata za turniej')

    // A transfer paid in full, then reversed: the charge is open again with two payment rows.
    const before = await getCharge(request, admin, transferred)
    const transfer = await recordPayment(request, admin, transferred, before.updatedAt, {
      amount: 10_000,
      method: 'transfer',
      paidOn: today,
      reference: 'Przelew',
    })
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201)
    const paid = await getCharge(request, admin, transferred)
    const reversal = await reversePayment(request, admin, String(transfer.body?.paymentId), paid.updatedAt, {
      reason: 'Zły tytuł przelewu',
    })
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201)

    // Two cash acceptances: KP …/001 pays one charge in full and half of the next, KP …/002 the other half.
    const first = await acceptCash(request, admin, {
      payerPersonId: adam,
      chargeIds: [fullyPaid, halfPaid],
      amount: 15_000,
      paidOn: today,
      notify: false,
    })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const second = await acceptCash(request, admin, {
      payerPersonId: adam,
      chargeIds: [halfPaid],
      amount: 5_000,
      paidOn: today,
      notify: false,
    })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    const month = `${today.slice(0, 4)}/${today.slice(5, 7)}`
    expect([first.body?.receiptNumber, second.body?.receiptNumber]).toEqual([`KP/${month}/001`, `KP/${month}/002`])
    const cashIds = [...(first.body?.payments ?? []), ...(second.body?.payments ?? [])].map((line) => line.paymentId)
    expect(cashIds).toHaveLength(3)
    expect((await getCharge(request, admin, halfPaid)).status).toBe('paid')
    await seedHandover(club, `RG/${month}/001`, cashIds.slice(0, 2))
    const secondHandover = await seedHandover(club, `RG/${month}/002`, cashIds.slice(2))

    // --- A clean club: no alert, nothing changed ---
    const clean = await fingerprint(club.tenant.organizationId)
    const cleanRun = verify(club)
    expect(cleanRun.run).toMatchObject({
      counts: { charges: 3, receipts: 2, handovers: 2 },
      drift: false,
      chargeDrifts: [],
      numberingDrifts: [],
    })
    expect(cleanRun.alerts).toEqual([])
    expect(await fingerprint(club.tenant.organizationId)).toBe(clean)

    // --- One payment row altered outside the commands: one alert naming the charge and the drift ---
    const altered = cashIds[2]
    await withClient(async (client) => {
      await client.query('update payments_payments set amount = amount - 1000 where id = $1', [altered])
    })
    const tampered = await fingerprint(club.tenant.organizationId)
    const driftRun = verify(club)
    expect(driftRun.run.drift).toBe(true)
    expect(driftRun.run.chargeDrifts).toEqual([
      { chargeId: halfPaid, kind: 'status', status: 'paid', expectedStatus: 'partially_paid' },
    ])
    expect(driftRun.run.numberingDrifts).toEqual([])
    expect(driftRun.alerts).toHaveLength(1)
    expect(driftRun.alerts[0]).toContain(halfPaid)
    // The console logger writes `key=value`, the JSON logger `"key":value`.
    expect(driftRun.alerts[0]).toMatch(/driftedCharges"?[=:]1\b/)
    expect(await fingerprint(club.tenant.organizationId)).toBe(tampered)
    expect((await getCharge(request, admin, halfPaid)).status).toBe('paid')

    // Another club's run sees nothing of it.
    const otherRun = verify(other)
    expect(otherRun.run).toMatchObject({ counts: { charges: 0, receipts: 0, handovers: 0 }, drift: false })
    expect(otherRun.alerts).toEqual([])

    // --- A handover number with a gap before it ---
    await withClient(async (client) => {
      await client.query('update payments_payments set amount = amount + 1000 where id = $1', [altered])
      await client.query('update payments_cash_handovers set number = $2 where id = $1', [
        secondHandover,
        `RG/${month}/003`,
      ])
    })
    const gapped = await fingerprint(club.tenant.organizationId)
    const gapRun = verify(club)
    expect(gapRun.run.chargeDrifts).toEqual([])
    expect(gapRun.run.numberingDrifts).toEqual([
      { series: 'RG', kind: 'gap', month: today.slice(0, 7), numbers: [`RG/${month}/002`], count: 1 },
    ])
    expect(gapRun.alerts).toHaveLength(1)
    expect(gapRun.alerts[0]).toContain(`RG/${month}/002`)
    expect(await fingerprint(club.tenant.organizationId)).toBe(gapped)
  } finally {
    await club.cleanup()
    await other.cleanup()
  }
})
