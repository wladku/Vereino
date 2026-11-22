import { expect, test } from '@playwright/test'
import { birthDateTurning, call, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { awaitEmails } from '../_fixtures/communication'
import { uniqueAddress } from '../_fixtures/messaging'
import { acceptCash } from '../_fixtures/payments'

// ISSUE-554 (REQ-031; issue #554, follow-up to #549): one adult with an e-mail address and 50 open manual charges of
// PLN 10, and 50 "Accept cash" requests sent at once, one charge each, with the confirmation e-mail on. The ephemeral
// app runs with `DB_POOL_MAX=20`. Before the fix the confirmation read the payer's contact (club settings), the
// charge texts and the collector on other pooled connections after the receipt numbering lock: the waiters on the lock
// held every connection, so the holder waited for a second one until the acquire timeout and answered 500. Now all 50
// answer 201 with `notified`, the receipts are 50 consecutive `KP/YYYY/MM/NNN` numbers and the payer gets 50 e-mails.
test.describe.configure({ timeout: 300_000 })

const ACCEPTANCES = 50
const KP = /^KP\/(\d{4})\/(\d{2})\/(\d{3})$/

test('ISSUE-554 fifty concurrent cash acceptances with the e-mail on all succeed with fifty consecutive KP numbers', async ({
  request,
}) => {
  const club = await createClub(request, 'issue-554')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const email = uniqueAddress('issue-554')
    const payer = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Potwierdzona',
      birthDate: birthDateTurning(30),
      email,
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
          notify: true,
        }),
      ),
    )
    const failures = results.filter((result) => result.status !== 201)
    expect(failures.map((result) => `${String(result.status)} ${JSON.stringify(result.body)}`)).toEqual([])
    expect(results.every((result) => result.body?.notified === true)).toBe(true)

    const receipts = results.map((result) => String(result.body?.receiptNumber))
    for (const receipt of receipts) expect(receipt).toMatch(KP)
    const prefixes = new Set(receipts.map((receipt) => receipt.slice(0, receipt.lastIndexOf('/'))))
    expect(prefixes.size).toBe(1)
    const sequences = receipts
      .map((receipt) => Number(receipt.slice(receipt.lastIndexOf('/') + 1)))
      .sort((a, b) => a - b)
    expect(sequences).toEqual(Array.from({ length: ACCEPTANCES }, (_, index) => index + 1))

    // One confirmation per receipt reaches the payer.
    const [prefix] = [...prefixes]
    const sent = await awaitEmails(email, `${prefix}/`, ACCEPTANCES)
    expect(new Set(sent.map((message) => receipts.find((receipt) => message.subject.includes(receipt))))).toEqual(
      new Set(receipts),
    )
  } finally {
    await club.cleanup()
  }
})
