import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import {
  bankDecide,
  bankPayers,
  bankTransfers,
  chargeOf,
  createFee,
  generate,
  getCharge,
  importStatement,
  listCharges,
  periodFromNow,
} from '../_fixtures/payments'

// TEST-082 (club management spec amendment B, research TEST-C08; REQ-030; issue #532): a family with one open charge
// of PLN 150. A statement transfer carrying the payer code and the exact amount is booked automatically. Undoing the
// booking (B-29 Undo) corrects the money with a reversing entry: a negative payment of the same charge that names the
// original in `reverses_payment_id` (S10.4). Nothing is deleted — the original payment row and the bank transaction
// row are still there — and the charge is open again.
// The research case undoes "after the receipt e-mail"; a bank booking sends no e-mail on main (REQ-030 asks for none;
// only "Accept cash" mails a `KP` receipt), so the row's "receipt e-mail sent" precondition has nothing to exercise.
// The guarantee it protects — a booking the payer may already know about is reversed, never erased — is asserted here.
test.describe.configure({ timeout: 300_000 })

type PaymentRow = {
  id: string
  charge_id: string
  amount: number
  method: string
  reverses_payment_id: string | null
  bank_transaction_id: string | null
  deleted_at: Date | null
}

async function paymentsOf(chargeId: string): Promise<PaymentRow[]> {
  const result = await withClient((client) =>
    client.query<PaymentRow>(
      'select id, charge_id, amount, method, reverses_payment_id, bank_transaction_id, deleted_at from payments_payments where charge_id = $1 order by created_at',
      [chargeId],
    ),
  )
  return result.rows
}

test('TEST-082 undoing an automatic bank booking reverses it and deletes nothing', async ({ request }) => {
  const club = await createClub(request, 'test-082')
  try {
    const admin = club.adminToken
    const since = calendarDate(-120)
    const today = calendarDate()
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 5,
      validFrom: since,
    })
    const payer = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Lis',
      birthDate: birthDateTurning(40),
    })
    const ward = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Lis',
      birthDate: birthDateTurning(10),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: payer,
      wardPersonId: ward,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
    const period = periodFromNow(-1)
    expect((await generate(request, admin, period)).status).toBe(200)
    const charge = chargeOf(await listCharges(request, admin, `&period=${period}`), ward, fee)
    const code = String(
      (await bankPayers(request, admin)).body?.items.find((i) => i.payerPersonId === payer)?.payerCode,
    )

    // The transfer with the payer code and the exact amount is booked automatically.
    const imported = await importStatement(
      request,
      admin,
      `Data;Kwota;Nadawca;Tytuł\n${today};150,00;Anna Lis;SKLADKA KUBA ${code}\n`,
    )
    expect(imported.status, JSON.stringify(imported.body)).toBe(201)
    expect(imported.body).toMatchObject({ total: 1, booked: 1 })
    const transfer = (await bankTransfers(request, admin)).body?.items.find((item) => item.title.includes(code))
    expect(transfer).toMatchObject({ status: 'booked', autoBooked: true, matchReason: 'code_exact' })
    expect((await getCharge(request, admin, charge.id)).status).toBe('paid')
    const booked = await paymentsOf(charge.id)
    expect(booked).toHaveLength(1)
    const original = booked[0]
    expect(original).toMatchObject({
      amount: 15000,
      method: 'transfer',
      reverses_payment_id: null,
      bank_transaction_id: transfer?.id,
      deleted_at: null,
    })

    // Undo: a reversing payment naming the original; the original and the transfer stay.
    const undone = await bankDecide(request, admin, String(transfer?.id), 'undo', transfer?.updatedAt)
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    expect(undone.body?.status).toBe('suggested')
    expect(undone.body?.payments?.map((line) => [line.chargeId, line.amount])).toEqual([[charge.id, -15000]])
    const after = await paymentsOf(charge.id)
    expect(after).toHaveLength(2)
    expect(after.find((row) => row.id === original.id)).toEqual(original)
    const reversal = after.find((row) => row.id !== original.id)
    expect(reversal).toMatchObject({ amount: -15000, reverses_payment_id: original.id, deleted_at: null })
    const transferRow = await withClient((client) =>
      client.query<{ status: string; deleted_at: Date | null }>(
        'select status, deleted_at from payments_bank_transactions where id = $1',
        [String(transfer?.id)],
      ),
    )
    expect(transferRow.rows).toEqual([{ status: 'suggested', deleted_at: null }])
    const detail = await getCharge(request, admin, charge.id)
    expect(detail.status).toBe('open')
    expect((await bankTransfers(request, admin)).body?.counts).toMatchObject({ booked: 0, suggested: 1, all: 1 })
  } finally {
    await club.cleanup()
  }
})
