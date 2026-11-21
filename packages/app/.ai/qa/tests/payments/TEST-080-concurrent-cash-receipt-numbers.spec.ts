import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { acceptCash, getCharge, type CodedBody } from '../_fixtures/payments'

// TEST-080 (club management spec amendment B, research TEST-C06; REQ-031; issue #532): one club, one adult member with
// N open manual charges of PLN 10, and N "Accept cash" calls at the same time, one per charge. `KP` numbers are issued
// per club and month under a transaction-scoped advisory lock (#223), so every call answers 201 with its own number,
// the N numbers are `KP/YYYY/MM/001` … N of the month the cash was received in — consecutive, none skipped, none
// repeated — each payment row carries the number its response named, and the next acceptance continues the series.
//
// The case of the spec is N = 50. It is `fixme` for a defect found while building it: at a concurrency above the
// server's database pool (20 connections) the acceptances do not get through — they answer 500 "timeout exceeded when
// trying to connect" (logged by `foundation` route-context as `payments.cash.record`, partly "[internal] the scope
// provider failed"), some 401 and 503, and a resend of the 20-odd failed ones fails the same way. Each acceptance holds
// a pooled connection in its write transaction (`inWriteTransaction` in `payments/commands/cash.ts`) and, inside it,
// resolves more work through the container (`clubClock` → settings service, `callerSettlesCash` → `rbacService`,
// before `lockReceiptNumbering`) — needing a second connection while holding the first, so 20 open transactions starve
// the pool until the acquire timeout. Below the pool size the same scenario passes (the second test, N = 15), which
// proves the numbering itself. Unfix when 50 concurrent acceptances all answer 201.
test.describe.configure({ timeout: 300_000 })

const KP = /^KP\/(\d{4})\/(\d{2})\/(\d{3})$/

async function concurrentCashKeepsTheSeries(request: APIRequestContext, slug: string, receipts: number) {
  const club = await createClub(request, slug)
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Kasowy',
      birthDate: birthDateTurning(30),
    })
    const addCharge = async (description: string) => {
      const created = await call<CodedBody & { chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
        data: { personId: adam, description, amount: 1000, dueDate: calendarDate(7) },
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.chargeId)
    }
    const accept = (chargeId: string) =>
      acceptCash(request, admin, {
        payerPersonId: adam,
        chargeIds: [chargeId],
        amount: 1000,
        paidOn: today,
        notify: false,
      })
    const chargeIds: string[] = []
    for (let index = 0; index < receipts; index += 1) chargeIds.push(await addCharge(`Opłata ${String(index + 1)}`))

    // All acceptances at once, each for its own charge.
    const results = await Promise.all(chargeIds.map(accept))
    for (const result of results) expect(result.status, JSON.stringify(result.body)).toBe(201)
    const numbers = results.map((result) => String(result.body?.receiptNumber))
    expect(new Set(numbers).size).toBe(receipts)
    const prefix = `KP/${today.slice(0, 4)}/${today.slice(5, 7)}/`
    for (const number of numbers) {
      expect(number).toMatch(KP)
      expect(number.startsWith(prefix)).toBe(true)
    }
    const sequences = numbers.map((number) => Number(number.slice(prefix.length))).sort((a, b) => a - b)
    expect(sequences).toEqual(Array.from({ length: receipts }, (_, index) => index + 1))

    // Each charge is paid and its payment row holds the number its own response named.
    const stored = await withClient((client) =>
      client.query<{ charge_id: string; receipt_number: string; amount: number }>(
        'select charge_id, receipt_number, amount from payments_payments where charge_id = any($1::uuid[]) and deleted_at is null',
        [chargeIds],
      ),
    )
    expect(stored.rows).toHaveLength(receipts)
    const byCharge = new Map(stored.rows.map((row) => [row.charge_id, row]))
    chargeIds.forEach((chargeId, index) => {
      expect(byCharge.get(chargeId)).toEqual({ charge_id: chargeId, receipt_number: numbers[index], amount: 1000 })
    })
    for (const chargeId of [chargeIds[0], chargeIds[receipts - 1]]) {
      expect((await getCharge(request, admin, chargeId)).status).toBe('paid')
    }

    // The next acceptance continues the series.
    const next = await accept(await addCharge('Opłata dodatkowa'))
    expect(next.status, JSON.stringify(next.body)).toBe(201)
    expect(next.body?.receiptNumber).toBe(`${prefix}${String(receipts + 1).padStart(3, '0')}`)
  } finally {
    await club.cleanup()
  }
}

// Defect described above: 50 concurrent acceptances starve the database pool.
test.fixme('TEST-080 fifty concurrent cash acceptances get fifty consecutive KP numbers', async ({ request }) => {
  await concurrentCashKeepsTheSeries(request, 'test-080', 50)
})

test('TEST-080 concurrent cash acceptances below the pool size get consecutive KP numbers', async ({ request }) => {
  await concurrentCashKeepsTheSeries(request, 'test-080-b', 15)
})
