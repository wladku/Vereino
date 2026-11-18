import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  call,
  calendarDate,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { checkout, connectStripe, myCharges, type CodedBody, type PaymentsSettingsBody } from '../_fixtures/payments'
import { createGuardianship } from '../_fixtures/people'

// TEST-C15, API part (payments parity spec phase 12, REQ-C14, AC-C14, DD-C11, V-C01; issue #302 E12-S12); the B-20
// part is `TEST-C15-online-payment-tab-ui.spec.ts`.
// - `GET /api/payments/settings` carries the offered methods (default card), the connection mode and the online fee
//   mode, and never a key: not connected without credentials, connected (test) with a `pk_test_` key, connected (live)
//   with a `pk_live_` key;
// - an empty or unknown selection → 422 `online_methods_invalid`; a stale lock token → 409;
// - with card and BLIK saved, the payer's checkout passes both to the test adapter as `paymentTypes`.
test.describe.configure({ timeout: 300_000 })

const SETTINGS_KEYS = [
  'autoBookBankMatches',
  'coachFeeAccess',
  'onlineConnection',
  'onlineFeeMode',
  'onlineMethods',
  'updatedAt',
]

test('TEST-C15 the settings carry the online connection and the offered methods, which the checkout uses', async ({
  request,
}) => {
  const club = await createClub(request, 'test-c15')
  try {
    const admin = club.adminToken
    const read = async () => {
      const response = await call<PaymentsSettingsBody>(request, 'GET', '/api/payments/settings', admin)
      expect(response.status, JSON.stringify(response.body)).toBe(200)
      return response.body ?? {}
    }

    // Defaults: card only, not connected, the club pays the fee.
    expect(await read()).toMatchObject({
      onlineMethods: ['card'],
      onlineConnection: 'not_connected',
      onlineFeeMode: 'club_pays',
    })

    // An empty, unknown or repeated selection is refused.
    for (const onlineMethods of [[], ['card', 'paypal'], ['card', 'card']]) {
      const refused = await call<CodedBody>(request, 'PUT', '/api/payments/settings', admin, {
        data: { onlineMethods },
      })
      expect(refused.status, JSON.stringify(refused.body)).toBe(422)
      expect(refused.body?.code).toBe('online_methods_invalid')
    }

    // Card and BLIK saved, stored in display order; the first save's token is then stale (409).
    const first = await call<PaymentsSettingsBody>(request, 'PUT', '/api/payments/settings', admin, {
      data: { onlineMethods: ['card'] },
    })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const saved = await call<PaymentsSettingsBody>(request, 'PUT', '/api/payments/settings', admin, {
      data: { onlineMethods: ['blik', 'card'] },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(first.body?.updatedAt) },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body?.onlineMethods).toEqual(['card', 'blik'])
    const stale = await call(request, 'PUT', '/api/payments/settings', admin, {
      data: { onlineMethods: ['card'] },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(first.body?.updatedAt) },
    })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)

    // A payer's checkout offers card and BLIK: the test adapter receives both as `paymentTypes`.
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Kowalska',
      birthDate: birthDateTurning(38),
    })
    // Kasia is the primary payer of her son, so his charge is hers to pay online.
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: kasia.personId,
      wardPersonId: jas,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-30),
    })
    const charge = await call<CodedBody & { chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
      data: { personId: jas, description: 'Składka', amount: 5000, dueDate: calendarDate(14) },
    })
    expect(charge.status, JSON.stringify(charge.body)).toBe(201)
    const payerToken = await signInAs(request, club, kasia.userId, kasia.email)
    const mine = await myCharges(request, payerToken)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body?.items?.map((item) => item.id)).toEqual([charge.body?.chargeId])
    const started = await checkout(request, payerToken, [String(charge.body?.chargeId)])
    expect(started.body?.clientSession?.payload?.paymentTypes).toEqual(['card', 'blik'])

    // The technical administrator enters test keys, then live keys: the mode follows, and no key leaves the server.
    await connectStripe(request, club, 'pk_test_vereinoC15')
    const testMode = await read()
    expect(testMode.onlineConnection).toBe('connected_test')
    expect(Object.keys(testMode).sort()).toEqual(SETTINGS_KEYS)
    expect(JSON.stringify(testMode)).not.toContain('vereinoC15')
    await connectStripe(request, club, 'pk_live_vereinoC15')
    const liveMode = await read()
    expect(liveMode.onlineConnection).toBe('connected_live')
    expect(JSON.stringify(liveMode)).not.toContain('vereinoC15')
  } finally {
    await club.cleanup()
  }
})
