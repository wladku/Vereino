import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { setUserFeatures } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import {
  cancelCharge,
  checkout,
  createFee,
  generate,
  getCharge,
  listCharges,
  myCharges,
  periodFromNow,
  quote,
  refreshCheckout,
  startCheckout,
} from '../_fixtures/payments'

// TEST-021 (payments spec phase 4 step 4, REQ-002, REQ-012, R10; issue #110 E07-S03), checkout part: two guardians,
// each the payer of their own ward. "My charges" lists only the caller's: the other family's charge is absent, and
// quoting, paying or refreshing it answers 403 (an unknown id too). A ward whose guardian is not the primary payer has a
// charge without a payer: listed, not payable, and the checkout answers 422 `payer_missing` ("no payer — contact the
// club"). A cancelled charge answers 409 `charge_not_open`. A 14-year-old with an account (the club allows accounts
// from 13) gets 403 `payments_minor` on every payer route, also with the payer features granted by hand.
test.describe.configure({ timeout: 300_000 })

test('TEST-021 someone else’s charge, a charge without a payer and a minor get no checkout', async ({ request }) => {
  const club = await createClub(request, 'test-021')
  try {
    const admin = club.adminToken
    const settings = await call<{ updatedAt?: string }>(request, 'GET', '/api/club_core/settings', admin)
    const saved = await call(request, 'PUT', '/api/club_core/settings', admin, {
      data: { ownAccountMinAge: 13 },
      headers: settings.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: settings.body.updatedAt } : {},
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
    })
    const basia = await createStaff(request, club, {
      firstName: 'Basia',
      lastName: 'Lis',
      birthDate: birthDateTurning(41),
    })
    const ward = async (firstName: string, lastName: string, age: number) => {
      const id = await createPerson(request, admin, { firstName, lastName, birthDate: birthDateTurning(age) })
      await addMembership(request, admin, {
        groupId: zaki,
        personId: id,
        role: 'participant',
        validFrom: calendarDate(-62),
      })
      return id
    }
    const ola = await ward('Ola', 'Nowak', 10)
    const tomek = await ward('Tomek', 'Nowak', 9)
    const zuzia = await ward('Zuzia', 'Lis', 14)
    const guardian = (guardianPersonId: string, wardPersonId: string, isPrimaryPayer: boolean) =>
      createGuardianship(request, admin, {
        guardianPersonId,
        wardPersonId,
        relation: 'parent',
        isPrimaryPayer,
        validFrom: calendarDate(-62),
      })
    await guardian(kasia.personId, ola, true)
    await guardian(kasia.personId, tomek, false)
    await guardian(basia.personId, zuzia, true)
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: calendarDate(-62),
    })
    expect((await generate(request, admin, periodFromNow(0))).body).toMatchObject({ created: 3, payerMissing: 1 })
    const charges = await listCharges(request, admin, `&period=${periodFromNow(0)}`)
    const chargeOf = (personId: string) => {
      const found = charges.find((charge) => charge.personId === personId && charge.sourceId === fee)
      expect(found, personId).toBeTruthy()
      return String(found?.id)
    }
    const olaCharge = chargeOf(ola)
    const tomekCharge = chargeOf(tomek)
    const zuziaCharge = chargeOf(zuzia)

    const kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const basiaToken = await signInAs(request, club, basia.userId, basia.email)

    // Kasia sees Ola's charge (payable) and Tomek's without a payer (not payable); never Basia's ward's.
    const mine = await myCharges(request, kasiaToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    const listed = new Map((mine.body?.items ?? []).map((item) => [item.id, item]))
    expect([...listed.keys()].sort()).toEqual([olaCharge, tomekCharge].sort())
    expect(listed.get(olaCharge)).toMatchObject({ payable: true, payerMissing: false })
    expect(listed.get(tomekCharge)).toMatchObject({ payable: false, payerMissing: true })

    // A charge without a payer cannot be paid online.
    for (const result of [
      await quote(request, kasiaToken, [tomekCharge]),
      await startCheckout(request, kasiaToken, [tomekCharge]),
    ]) {
      expect(result.status, JSON.stringify(result.body)).toBe(422)
      expect(result.body?.code).toBe('payer_missing')
    }

    // Someone else's charge, alone or with one's own, and an unknown id: 403, nothing created.
    for (const ids of [[zuziaCharge], [olaCharge, zuziaCharge], ['00000000-0000-4000-8000-000000000000']]) {
      const quoted = await quote(request, kasiaToken, ids)
      expect(quoted.status, JSON.stringify(quoted.body)).toBe(403)
      expect(quoted.body?.code).toBe('checkout_charge_forbidden')
      const started = await startCheckout(request, kasiaToken, ids)
      expect(started.status, JSON.stringify(started.body)).toBe(403)
    }
    expect((await myCharges(request, kasiaToken)).body?.checkouts).toEqual([])

    // Someone else's checkout cannot be refreshed.
    const basiaCheckout = await checkout(request, basiaToken, [zuziaCharge])
    const foreign = await refreshCheckout(request, kasiaToken, basiaCheckout.checkoutId)
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)

    // A cancelled charge is not open.
    const olaDetail = await getCharge(request, admin, olaCharge)
    const cancelled = await cancelCharge(request, admin, olaCharge, olaDetail.updatedAt, { reason: 'Left the club' })
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const notOpen = await quote(request, kasiaToken, [olaCharge])
    expect(notOpen.status, JSON.stringify(notOpen.body)).toBe(409)
    expect(notOpen.body?.code).toBe('charge_not_open')

    // A 14-year-old with an account: 403 `payments_minor`, also with the payer features granted by hand.
    const zuziaEmail = `zuzia-${Date.now().toString(36)}@example.org`
    const account = await createAccount(request, admin, zuzia, zuziaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const zuziaUserId = String(account.body?.userId)
    club.extraUserIds.push(zuziaUserId)
    await setUserFeatures(request, club, zuziaUserId, ['people.self', 'payments.view_own', 'payments.pay_online'])
    const zuziaToken = await signInAs(request, club, zuziaUserId, zuziaEmail)
    const minorResults = [
      await myCharges(request, zuziaToken),
      await quote(request, zuziaToken, [zuziaCharge]),
      await startCheckout(request, zuziaToken, [zuziaCharge]),
      await refreshCheckout(request, zuziaToken, basiaCheckout.checkoutId),
    ]
    for (const result of minorResults) {
      expect(result.status, JSON.stringify(result.body)).toBe(403)
      expect(result.body?.code).toBe('payments_minor')
    }
  } finally {
    await club.cleanup()
  }
})
