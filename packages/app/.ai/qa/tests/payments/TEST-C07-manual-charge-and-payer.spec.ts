import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { OPTIMISTIC_LOCK_HEADER, birthDateTurning, call, calendarDate, createClub, createPerson, createStaff, signInAs } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { createGuardianship, getGuardianship, updateGuardianship } from '../_fixtures/people'
import { getCharge, myCharges, recordPayment, type CodedBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C07 (payments parity spec phase 5, REQ-C06, AC-C06; issue #295 E12-S05): a minor without a guardian (Bartek),
// a minor whose guardian is not the payer (Ola, her father Piotr) and an adult member (Adam).
// - `POST /api/payments/charges` adds a manual charge: the payer by the *Payer* rule (Adam pays for himself), else
//   `payerMissing`; a named payer must be an active guardian or the adult debtor (422 `charge_payer_not_eligible`); a
//   due date beyond 12 months → 422 `charge_due_date_out_of_range`; a short description → 400; an unknown person → 404.
// - `POST /api/payments/charges/{id}/payer`: a stranger → 422; no lock token → 400; a stale one → 409; Bartek's mother
//   → 200, the charge appears on her `my-charges` (M-08); a second assignment → 409 `charge_payer_already_set`.
// - Marking Piotr as primary payer assigns him to Ola's open charge without a payer (the subscriber of
//   `people.guardianship.updated`, which carries `wardPersonId`); her paid charge stays without a payer; replaying the
//   update changes nothing.
// - B-22 (UI): "No payer" with "Assign payer" and the guardianship link; the dialog lists the guardian and assigns her.
test.describe.configure({ timeout: 300_000 })

type CreateBody = CodedBody & { chargeId?: string; payerMissing?: boolean }
type PayerBody = CodedBody & { payerPersonId?: string; updatedAt?: string }

test('TEST-C07 manual charges, assigning a payer by hand and from the guardianship', async ({ page, request }) => {
  const club = await createClub(request, 'test-c07')
  try {
    let admin = club.adminToken
    const inAWeek = calendarDate(7)
    const bartek = await createPerson(request, admin, {
      firstName: 'Bartek',
      lastName: 'Wolny',
      birthDate: birthDateTurning(9),
    })
    const ola = await createPerson(request, admin, { firstName: 'Ola', lastName: 'Kos', birthDate: birthDateTurning(10) })
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Dorosły',
      birthDate: birthDateTurning(30),
    })
    const stranger = await createPerson(request, admin, {
      firstName: 'Obcy',
      lastName: 'Człowiek',
      birthDate: birthDateTurning(45),
    })
    const piotr = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Kos',
      birthDate: birthDateTurning(42),
    })
    const marta = await createStaff(request, club, {
      firstName: 'Marta',
      lastName: 'Wolna',
      birthDate: birthDateTurning(38),
    })
    const piotrGuardianship = await createGuardianship(request, admin, {
      guardianPersonId: piotr,
      wardPersonId: ola,
      relation: 'parent',
      isPrimaryPayer: false,
      validFrom: calendarDate(-30),
    })
    const addCharge = (data: Record<string, unknown>) =>
      call<CreateBody>(request, 'POST', '/api/payments/charges', admin, { data })
    const assignPayer = (chargeId: string, lock: string | null, payerPersonId: string) =>
      call<PayerBody>(request, 'POST', `/api/payments/charges/${chargeId}/payer`, admin, {
        data: { payerPersonId },
        headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
      })
    const tournament = { description: 'Opłata za turniej', amount: 4000, dueDate: inAWeek }

    // The *Payer* rule: no guardian → without a payer; an adult pays for himself; a guardian who is not the primary
    // payer is not chosen by the rule, but may be named.
    const forBartek = await addCharge({ ...tournament, personId: bartek })
    expect(forBartek.status, JSON.stringify(forBartek.body)).toBe(201)
    expect(forBartek.body).toMatchObject({ payerMissing: true })
    const bartekCharge = String(forBartek.body?.chargeId)
    const forAdam = await addCharge({ ...tournament, personId: adam })
    expect(forAdam.status, JSON.stringify(forAdam.body)).toBe(201)
    expect(forAdam.body).toMatchObject({ payerMissing: false })
    expect(await getCharge(request, admin, String(forAdam.body?.chargeId))).toMatchObject({
      sourceType: 'manual',
      payee: 'club',
      payerPersonId: adam,
      amountDue: 4000,
      dueDate: inAWeek,
      status: 'open',
    })
    const named = await addCharge({ ...tournament, personId: ola, payerPersonId: piotr })
    expect(named.status, JSON.stringify(named.body)).toBe(201)
    expect(named.body).toMatchObject({ payerMissing: false })
    expect((await getCharge(request, admin, String(named.body?.chargeId))).payerPersonId).toBe(piotr)

    // Refusals.
    const notEligible = await addCharge({ ...tournament, personId: ola, payerPersonId: stranger })
    expect(notEligible.status, JSON.stringify(notEligible.body)).toBe(422)
    expect(notEligible.body?.code).toBe('charge_payer_not_eligible')
    const tooLate = await addCharge({ ...tournament, personId: bartek, dueDate: calendarDate(400) })
    expect(tooLate.status, JSON.stringify(tooLate.body)).toBe(422)
    expect(tooLate.body?.code).toBe('charge_due_date_out_of_range')
    const tooShort = await addCharge({ ...tournament, personId: bartek, description: 'ab' })
    expect(tooShort.status, JSON.stringify(tooShort.body)).toBe(400)
    const tooMuch = await addCharge({ ...tournament, personId: bartek, amount: 10_000_001 })
    expect(tooMuch.status, JSON.stringify(tooMuch.body)).toBe(400)
    const nobody = await addCharge({ ...tournament, personId: '00000000-0000-4000-8000-000000000000' })
    expect(nobody.status, JSON.stringify(nobody.body)).toBe(404)

    // Bartek's charge: no payer and nobody to choose until his mother becomes his guardian (not the primary payer).
    let detail = await getCharge(request, admin, bartekCharge)
    expect(detail).toMatchObject({ payerMissing: true, payerPersonId: null })
    expect((detail as unknown as { payerOptions: unknown[] }).payerOptions).toEqual([])
    await createGuardianship(request, admin, {
      guardianPersonId: marta.personId,
      wardPersonId: bartek,
      relation: 'parent',
      isPrimaryPayer: false,
      validFrom: calendarDate(-1),
    })
    detail = await getCharge(request, admin, bartekCharge)
    expect((detail as unknown as { payerOptions: unknown[] }).payerOptions).toEqual([
      { id: marta.personId, firstName: 'Marta', lastName: 'Wolna' },
    ])
    const strangerPays = await assignPayer(bartekCharge, detail.updatedAt, stranger)
    expect(strangerPays.status, JSON.stringify(strangerPays.body)).toBe(422)
    expect(strangerPays.body?.code).toBe('charge_payer_not_eligible')
    const noLock = await assignPayer(bartekCharge, null, marta.personId)
    expect(noLock.status, JSON.stringify(noLock.body)).toBe(400)
    const stale = await assignPayer(bartekCharge, '2020-01-01T00:00:00.000Z', marta.personId)
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    const assigned = await assignPayer(bartekCharge, detail.updatedAt, marta.personId)
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    expect(assigned.body).toMatchObject({ payerPersonId: marta.personId })
    detail = await getCharge(request, admin, bartekCharge)
    expect(detail).toMatchObject({ payerMissing: false, payerPersonId: marta.personId })
    const again = await assignPayer(bartekCharge, detail.updatedAt, marta.personId)
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('charge_payer_already_set')
    // The charge now reaches Marta's phone (M-08).
    const martaToken = await signInAs(request, club, marta.userId, marta.email)
    const mine = await myCharges(request, martaToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body?.items?.map((item) => item.id)).toContain(bartekCharge)

    // Ola: an open charge and a paid one, both without a payer; marking Piotr as primary payer assigns the open one.
    const olaOpen = await addCharge({ ...tournament, personId: ola })
    const olaPaid = await addCharge({ ...tournament, personId: ola, description: 'Obóz — zaliczka' })
    expect(olaOpen.body).toMatchObject({ payerMissing: true })
    expect(olaPaid.body).toMatchObject({ payerMissing: true })
    const olaOpenId = String(olaOpen.body?.chargeId)
    const olaPaidId = String(olaPaid.body?.chargeId)
    const paid = await recordPayment(request, admin, olaPaidId, (await getCharge(request, admin, olaPaidId)).updatedAt, {
      amount: 4000,
      method: 'cash',
      paidOn: calendarDate(),
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    const current = await getGuardianship(request, admin, piotrGuardianship)
    const marked = await updateGuardianship(
      request,
      admin,
      { id: piotrGuardianship, isPrimaryPayer: true },
      current.body?.updatedAt,
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    await expect
      .poll(async () => (await getCharge(request, admin, olaOpenId)).payerPersonId, { timeout: 30_000 })
      .toBe(piotr)
    const assignedOpen = await getCharge(request, admin, olaOpenId)
    expect(assignedOpen).toMatchObject({ payerMissing: false, status: 'open' })
    expect(await getCharge(request, admin, olaPaidId)).toMatchObject({
      payerMissing: true,
      payerPersonId: null,
      status: 'paid',
    })
    // A replayed update (another `people.guardianship.updated`) assigns nothing again.
    const replay = await updateGuardianship(
      request,
      admin,
      { id: piotrGuardianship, relation: 'legal_guardian' },
      marked.body?.updatedAt,
    )
    expect(replay.status, JSON.stringify(replay.body)).toBe(200)
    await page.waitForTimeout(3_000)
    expect((await getCharge(request, admin, olaOpenId)).updatedAt).toBe(assignedOpen.updatedAt)

    // B-22 (UI): a charge without a payer gets one from the dialog.
    const forBartekUi = await addCharge({ ...tournament, personId: bartek, description: 'Turniej halowy' })
    expect(forBartekUi.body).toMatchObject({ payerMissing: true })
    const uiCharge = String(forBartekUi.body?.chargeId)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto(`/backend/payments/charges/${uiCharge}`)
    await expect(page.getByTestId('charge-payer-missing')).toBeVisible()
    await expect(page.getByTestId('charge-guardianship-link')).toHaveAttribute(
      'href',
      `/backend/people/persons/${bartek}?tab=guardianship`,
    )
    await page.getByTestId('assign-payer-open').click()
    const dialog = page.getByTestId('assign-payer-dialog')
    await expect(dialog.getByTestId('assign-payer-option')).toHaveCount(1)
    await expect(dialog.getByTestId('assign-payer-option')).toContainText('Marta Wolna')
    await dialog.getByTestId('assign-payer-confirm').click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('charge-payer')).toHaveText('Marta Wolna')
    await expect(page.getByTestId('assign-payer-open')).toHaveCount(0)
    expect(await getCharge(request, admin, uiCharge)).toMatchObject({ payerPersonId: marta.personId })
    await expect(page.getByText(uiText('payments.assignPayer.done', { exact: true }))).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
