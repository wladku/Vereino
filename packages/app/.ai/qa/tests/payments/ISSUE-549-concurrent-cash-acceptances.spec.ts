import { expect, test } from '@playwright/test'
import { birthDateTurning, call, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { acceptCash, cashToday } from '../_fixtures/payments'

// ISSUE-549 (REQ-031; issue #549): one adult with 50 open manual charges of PLN 10, and 50 "Accept cash" requests
// sent at once, one charge each, without the e-mail. The ephemeral app runs with `DB_POOL_MAX=20`: before the fix each
// acceptance held its write transaction's pooled connection while the scope provider, the club clock and the RBAC
// check waited for a second one, so from about 20 concurrent requests on all of them waited until the acquire timeout
// and answered 500 (`timeout exceeded when trying to connect`), 401 or 503. Now all 50 answer 201 and the receipts
// are 50 consecutive `KP/YYYY/MM/NNN` numbers, one per payment, with no gap.
test.describe.configure({ timeout: 300_000 })

const ACCEPTANCES = 50
const KP = /^KP\/(\d{4})\/(\d{2})\/(\d{3})$/

test('ISSUE-549 fifty concurrent cash acceptances all succeed with fifty consecutive KP numbers', async ({
  request,
}) => {
  const club = await createClub(request, 'issue-549')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const payer = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Równoległy',
      birthDate: birthDateTurning(30),
    })
    const chargeIds: string[] = []
    for (let index = 0; index < ACCEPTANCES; index += 1) {
      const created = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
        data: { personId: payer, description: `Wpisowe ${String(index + 1)}`, amount: 1000, dueDate: calendarDate(7) },
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      chargeIds.push(String(created.body?.chargeId))
    }

    const results = await Promise.all(
      chargeIds.map((chargeId) =>
        acceptCash(request, admin, {
          payerPersonId: payer,
          chargeIds: [chargeId],
          amount: 1000,
          paidOn: today,
          notify: false,
        }),
      ),
    )
    const failures = results.filter((result) => result.status !== 201)
    expect(failures.map((result) => `${String(result.status)} ${JSON.stringify(result.body)}`)).toEqual([])

    const receipts = results.map((result) => String(result.body?.receiptNumber))
    for (const receipt of receipts) expect(receipt).toMatch(KP)
    const prefixes = new Set(receipts.map((receipt) => receipt.slice(0, receipt.lastIndexOf('/'))))
    expect(prefixes.size).toBe(1)
    const sequences = receipts
      .map((receipt) => Number(receipt.slice(receipt.lastIndexOf('/') + 1)))
      .sort((a, b) => a - b)
    expect(sequences).toEqual(Array.from({ length: ACCEPTANCES }, (_, index) => index + 1))

    // "Received by me today" lists every receipt once.
    const listed = await cashToday(request, admin)
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(new Set(listed.body?.items.map((item) => item.receiptNumber))).toEqual(new Set(receipts))
  } finally {
    await club.cleanup()
  }
})
