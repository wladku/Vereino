import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'
import {
  type CodedBody,
  chargeOf,
  createDiscountRule,
  createFee,
  generate,
  listCharges,
  periodFromNow,
  postDiscountRule,
  postFee,
  undoInProbe,
} from '../_fixtures/payments'

// TEST-018 (payments spec phase 4 step 2, REQ-011; issue #108 E07-S01): two groups with fee schedules in two
// sections (Żaki PLN 150 in the academy, Basen PLN 120 in the pool), siblings split across the sections, their mother
// and another adult in zumba, a minor without a payer, a 30 % sibling rule. Generating a period creates one charge per
// person and period with the discount on the younger sibling (and the rule's name), the adult paying for themselves
// and the minor flagged without payer; a second run creates nothing and skips everything. A fee with both a group and
// an activity → 422 "Choose exactly one: a group or an activity"; changing a billed fee's period → 422; a running generation → 409; a month too far back →
// 422; a coordinator → 403. Undoing a generation cancels its open charges, and the period generates again; an undo that
// rolls back emits no `payments.charge.cancelled`, one that commits emits it once (#184). The
// "Coaches and payments" setting reads `collect` by default and saves.
test.describe.configure({ timeout: 300_000 })

test('TEST-018 a period generates once per person with the sibling discount; repeats skip; 422, 409 and undo', async ({
  request,
}) => {
  const club = await createClub(request, 'test-018')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const period = periodFromNow(1)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const basen = await createGroup(request, admin, { sectionId: pool, name: 'Basen — dzieci', kind: 'class_group' })
    const zumba = await createGroup(request, admin, { sectionId: pool, name: 'Zumba', kind: 'class_group' })

    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Nowak',
      birthDate: birthDateTurning(40),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(10),
    })
    const kuba = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Nowak',
      birthDate: birthDateTurning(7),
    })
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Zieliński',
      birthDate: birthDateTurning(30),
    })
    const tomek = await createPerson(request, admin, {
      firstName: 'Tomek',
      lastName: 'Bez',
      birthDate: birthDateTurning(9),
    })
    for (const ward of [ola, kuba]) {
      await createGuardianship(request, admin, {
        guardianPersonId: anna,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: today,
      })
    }
    await addMembership(request, admin, { groupId: zaki, personId: ola, role: 'participant', validFrom: today })
    await addMembership(request, admin, { groupId: basen, personId: kuba, role: 'participant', validFrom: today })
    await addMembership(request, admin, { groupId: basen, personId: tomek, role: 'participant', validFrom: today })
    await addMembership(request, admin, { groupId: zumba, personId: adam, role: 'participant', validFrom: today })
    // The mother pays her own fee too, but she is not one of the siblings she pays for.
    await addMembership(request, admin, { groupId: zumba, personId: anna, role: 'participant', validFrom: today })

    const zakiFee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: today,
    })
    const basenFee = await createFee(request, admin, {
      name: 'Basen',
      groupId: basen,
      period: 'monthly',
      amount: 12000,
      dueDay: 5,
      validFrom: today,
    })
    const zumbaFee = await createFee(request, admin, {
      name: 'Zumba',
      groupId: zumba,
      period: 'monthly',
      amount: 8000,
      dueDay: 10,
      validFrom: today,
    })
    const sibling = await createDiscountRule(request, admin, {
      name: 'Rodzeństwo 30%',
      kind: 'sibling',
      percent: 30,
      validFrom: today,
    })

    // A fee with both a group and an activity (or neither) → 422; a sibling rule with an amount → 422.
    const both = await postFee(request, admin, {
      name: 'Oba',
      groupId: zaki,
      activityId: zumba,
      period: 'monthly',
      amount: 1000,
      dueDay: 1,
      validFrom: today,
    })
    expect(both.status, JSON.stringify(both.body)).toBe(422)
    expect(both.body?.code).toBe('fee_target_invalid')
    expect(both.body?.error).toBe('Choose exactly one: a group or an activity')
    const neither = await postFee(request, admin, {
      name: 'Żadne',
      period: 'monthly',
      amount: 1000,
      dueDay: 1,
      validFrom: today,
    })
    expect(neither.status).toBe(422)
    expect(neither.body?.code).toBe('fee_target_invalid')
    const badDay = await postFee(request, admin, {
      name: 'Dzień',
      groupId: zaki,
      period: 'monthly',
      amount: 1000,
      dueDay: 29,
      validFrom: today,
    })
    expect(badDay.status).toBe(400)
    const amountSibling = await postDiscountRule(request, admin, {
      name: 'Kwota',
      kind: 'sibling',
      amount: 1000,
      validFrom: today,
    })
    expect(amountSibling.status).toBe(422)
    expect(amountSibling.body?.code).toBe('discount_value_invalid')

    // The generation: one charge per person, the younger sibling discounted with the rule's name, the adult pays for
    // themselves, the minor without a guardian is flagged.
    const first = await generate(request, admin, period)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body).toMatchObject({ period, created: 5, skipped: 0, payerMissing: 1 })
    const charges = await listCharges(request, admin, `&period=${period}`)
    expect(charges).toHaveLength(5)
    expect(chargeOf(charges, ola, zakiFee)).toMatchObject({
      description: 'Żaki',
      payerPersonId: anna,
      payerMissing: false,
      amount: 15000,
      discountAmount: 0,
      amountDue: 15000,
      dueDate: `${period}-10`,
      status: 'open',
      periodLabel: period,
    })
    expect(chargeOf(charges, kuba, basenFee)).toMatchObject({
      payerPersonId: anna,
      amount: 12000,
      discountAmount: 3600,
      amountDue: 8400,
      discountRuleId: sibling,
      discountRuleName: 'Rodzeństwo 30%',
      dueDate: `${period}-05`,
    })
    expect(chargeOf(charges, adam, zumbaFee)).toMatchObject({ payerPersonId: adam, payerMissing: false, amount: 8000 })
    expect(chargeOf(charges, anna, zumbaFee)).toMatchObject({ payerPersonId: anna, amount: 8000, discountAmount: 0 })
    expect(chargeOf(charges, tomek, basenFee)).toMatchObject({
      payerPersonId: null,
      payerMissing: true,
      discountAmount: 0,
    })
    expect(
      (await listCharges(request, admin, `&period=${period}&payerMissing=1`)).map((charge) => charge.personId),
    ).toEqual([tomek])

    // The description is encrypted at rest (payments spec *Data Models* → `payments_charges.description`).
    const stored = await withClient((client) =>
      client.query<{ description: string }>('select description from payments_charges where id = $1', [
        chargeOf(charges, ola, zakiFee).id,
      ]),
    )
    expect(stored.rows[0]?.description).toBeTruthy()
    expect(stored.rows[0]?.description).not.toBe('Żaki')

    // The same period again: nothing new, everything skipped.
    const second = await generate(request, admin, period)
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ created: 0, skipped: 5, payerMissing: 0 })
    expect(await listCharges(request, admin, `&period=${period}`)).toHaveLength(5)

    // A fee that has billed anyone keeps its period: its charges are keyed by fee and period label.
    const zakiRow = await call<{ items?: Array<{ id: string; updatedAt?: string | null }> }>(
      request,
      'GET',
      `/api/payments/fees?groupId=${zaki}`,
      admin,
    )
    const zakiLock = zakiRow.body?.items?.find((item) => item.id === zakiFee)?.updatedAt
    expect(zakiLock, 'lock token of the Żaki fee').toBeTruthy()
    const periodChange = await call<CodedBody>(request, 'PUT', '/api/payments/fees', admin, {
      data: { id: zakiFee, period: 'one_off' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(zakiLock) },
    })
    expect(periodChange.status, JSON.stringify(periodChange.body)).toBe(422)
    expect(periodChange.body?.code).toBe('fee_period_locked')

    // A generation running in the club → 409; the lock is the club's, so another club is not blocked.
    const blocked = await withClient(async (client) => {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `payments.charges.generate:${club.tenant.organizationId}`,
      ])
      try {
        return await generate(request, admin, period)
      } finally {
        await client.query('rollback')
      }
    })
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(409)
    expect(blocked.body?.code).toBe('generation_in_progress')

    // A month more than 12 months back → 422; a coordinator may not generate.
    const tooOld = await generate(request, admin, periodFromNow(-13))
    expect(tooOld.status).toBe(422)
    expect(tooOld.body?.code).toBe('period_out_of_range')
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    expect((await generate(request, coordinator.token, period)).status).toBe(403)
    expect((await call(request, 'GET', '/api/payments/fees', coordinator.token)).status).toBe(403)

    // Undo of the first generation cancels its open charges; the period then generates them again.
    const firstLog = (await actionLogEntries(request, admin, String(first.body?.generationId))).find(
      (entry) => entry.commandId === 'payments.charges.generate',
    )
    expect(firstLog?.undoToken, 'undo token of the first generation').toBeTruthy()
    // An undo whose replay rolls back after the handler ran (the bus's audit write fails, #184) cancels nothing and
    // emits no `payments.charge.cancelled`: the event waits for the replay transaction's commit.
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const rolledBack = undoInProbe(scope, {
      userId: club.adminUserId,
      undoToken: String(firstLog?.undoToken),
      failAuditWrite: true,
    })
    expect(rolledBack.error).toContain('the audit write failed')
    expect(rolledBack.events.map((entry) => entry.event)).not.toContain('payments.charge.cancelled')
    expect(await listCharges(request, admin, `&period=${period}&status=open`)).toHaveLength(5)
    const undone = await undoByToken(request, admin, String(firstLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const afterUndo = await listCharges(request, admin, `&period=${period}`)
    expect(afterUndo.map((charge) => charge.status)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
      'cancelled',
      'cancelled',
    ])
    const again = await generate(request, admin, period)
    expect(again.body).toMatchObject({ created: 5, skipped: 0, payerMissing: 1 })
    expect(await listCharges(request, admin, `&period=${period}&status=open`)).toHaveLength(5)

    // An undo that commits emits `payments.charge.cancelled` once, with the cancelled charges, after the commit.
    const againLog = (await actionLogEntries(request, admin, String(again.body?.generationId))).find(
      (entry) => entry.commandId === 'payments.charges.generate',
    )
    expect(againLog?.undoToken, 'undo token of the second generation').toBeTruthy()
    const againOpen = (await listCharges(request, admin, `&period=${period}&status=open`)).map((charge) => charge.id)
    const committed = undoInProbe(scope, { userId: club.adminUserId, undoToken: String(againLog?.undoToken) })
    expect(committed.error).toBeNull()
    const cancelledEvents = committed.events.filter((entry) => entry.event === 'payments.charge.cancelled')
    expect(cancelledEvents).toHaveLength(1)
    expect(cancelledEvents[0]?.payload).toMatchObject({ generationId: again.body?.generationId, ...scope })
    expect([...((cancelledEvents[0]?.payload.chargeIds as string[] | undefined) ?? [])].sort()).toEqual(
      [...againOpen].sort(),
    )
    expect(await listCharges(request, admin, `&period=${period}&status=open`)).toHaveLength(0)

    // Undoing a period change after the fee has billed anyone → 422 too: the old period would bill the same people again.
    const camp = await createFee(request, admin, {
      name: 'Obóz',
      groupId: zaki,
      period: 'monthly',
      amount: 50000,
      dueDay: 15,
      validFrom: today,
    })
    const campRow = await call<{ items?: Array<{ id: string; updatedAt?: string | null }> }>(
      request,
      'GET',
      `/api/payments/fees?groupId=${zaki}`,
      admin,
    )
    const campLock = campRow.body?.items?.find((item) => item.id === camp)?.updatedAt
    expect(campLock, 'lock token of the camp fee').toBeTruthy()
    const toOneOff = await call<CodedBody>(request, 'PUT', '/api/payments/fees', admin, {
      data: { id: camp, period: 'one_off' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(campLock) },
    })
    expect(toOneOff.status, JSON.stringify(toOneOff.body)).toBe(200)
    const campRun = await generate(request, admin, periodFromNow(2))
    expect(campRun.status, JSON.stringify(campRun.body)).toBe(200)
    expect(
      (await listCharges(request, admin, `&period=one_off`)).filter((charge) => charge.personId === ola),
    ).toHaveLength(1)
    const periodLog = (await actionLogEntries(request, admin, camp)).find(
      (entry) => entry.commandId === 'payments.fees.update',
    )
    expect(periodLog?.undoToken, 'undo token of the period change').toBeTruthy()
    const undoPeriod = await undoByToken(request, admin, String(periodLog?.undoToken))
    expect(undoPeriod.status(), await undoPeriod.text()).toBe(422)
    expect(((await undoPeriod.json()) as CodedBody).code).toBe('fee_period_locked')

    // "Coaches and payments": `collect` by default, then saved.
    const defaults = await call<{ coachFeeAccess?: string; updatedAt?: string | null }>(
      request,
      'GET',
      '/api/payments/settings',
      admin,
    )
    expect(defaults.body).toMatchObject({ coachFeeAccess: 'collect', updatedAt: null })
    const saved = await call<{ coachFeeAccess?: string }>(request, 'PUT', '/api/payments/settings', admin, {
      data: { coachFeeAccess: 'view' },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await call(request, 'GET', '/api/payments/settings', admin)).body).toMatchObject({ coachFeeAccess: 'view' })
  } finally {
    await club.cleanup()
  }
})
