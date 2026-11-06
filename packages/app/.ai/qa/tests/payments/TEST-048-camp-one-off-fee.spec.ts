import { expect, test } from '@playwright/test'
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
import { addMembership, createGroup } from '../_fixtures/groups'
import { createActivity } from '../_fixtures/activities'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'
import { chargeOf, createDiscountRule, createFee, generate, listCharges, periodFromNow } from '../_fixtures/payments'

// TEST-048 (payments spec phase 4 step 2, REQ-018, REQ-011; issue #108 E07-S01): a `camp` activity of Żaki with a
// `one_off` fee schedule; two siblings of one payer — the older one swims (monthly fee), the younger one plays in
// Żaki and goes to the camp. Generation creates one `fee` charge per camp participant labelled `one_off`. With the
// default sibling rule (monthly fees only) the camp charge is not discounted; after the rule also covers one-off fees
// (the generation undone and run again), the camp charge carries the sibling discount. A later month does not charge
// the camp twice. The camp charge is in the administrator's list.
test.describe.configure({ timeout: 300_000 })

test('TEST-048 a camp is charged once per participant; the sibling discount follows the rule', async ({ request }) => {
  const club = await createClub(request, 'test-048')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const period = periodFromNow(1)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
    const pitch = await createStructure(request, admin, 'places', {
      name: 'Boisko A',
      kind: 'pitch',
      capacityGroups: 1,
    })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const basen = await createGroup(request, admin, { sectionId: pool, name: 'Basen — dzieci', kind: 'class_group' })

    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Lis',
      birthDate: birthDateTurning(41),
    })
    const ola = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Lis',
      birthDate: birthDateTurning(11),
    })
    const kuba = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Lis',
      birthDate: birthDateTurning(8),
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
    await addMembership(request, admin, { groupId: basen, personId: ola, role: 'participant', validFrom: today })
    await addMembership(request, admin, { groupId: zaki, personId: kuba, role: 'participant', validFrom: today })

    const campDay = `${period}-15`
    // A one-off `camp` activity (a single day without a recurrence rule).
    const { id: campId } = await createActivity(request, admin, {
      groupId: zaki,
      name: 'Obóz zimowy',
      type: 'camp',
      placeId: pitch,
      startsOn: campDay,
      startTime: '09:00',
      endTime: '17:00',
    })

    const basenFee = await createFee(request, admin, {
      name: 'Basen',
      groupId: basen,
      period: 'monthly',
      amount: 12000,
      dueDay: 5,
      validFrom: today,
    })
    const zakiFee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: today,
    })
    const campFee = await createFee(request, admin, {
      name: 'Obóz zimowy',
      activityId: campId,
      period: 'one_off',
      amount: 90000,
      dueDay: 1,
      validFrom: today,
    })
    const rule = await createDiscountRule(request, admin, {
      name: 'Rodzeństwo',
      kind: 'sibling',
      percent: 30,
      validFrom: today,
    })

    // Default sibling rule (monthly fees only): Kuba's monthly fee is discounted, the camp is not.
    const first = await generate(request, admin, period)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body).toMatchObject({ created: 3, skipped: 0, payerMissing: 0 })
    let charges = await listCharges(request, admin, '')
    expect(chargeOf(charges, ola, basenFee)).toMatchObject({ discountAmount: 0, periodLabel: period })
    expect(chargeOf(charges, kuba, zakiFee)).toMatchObject({ discountAmount: 4500, discountRuleId: rule })
    expect(chargeOf(charges, kuba, campFee)).toMatchObject({
      periodLabel: 'one_off',
      amount: 90000,
      discountAmount: 0,
      payerPersonId: anna,
      dueDate: `${period}-01`,
    })

    // The rule now covers one-off fees: undo the generation, change the rule, generate again.
    const log = (await actionLogEntries(request, admin, String(first.body?.generationId))).find(
      (entry) => entry.commandId === 'payments.charges.generate',
    )
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const rules = await call<{ items?: { id: string; updatedAt: string }[] }>(
      request,
      'GET',
      `/api/payments/discount-rules?ids=${rule}`,
      admin,
    )
    const updated = await call(request, 'PUT', '/api/payments/discount-rules', admin, {
      data: { id: rule, conditions: { feePeriods: ['monthly', 'one_off'], fullRate: 'oldest' } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(rules.body?.items?.[0]?.updatedAt) },
    })
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)
    const second = await generate(request, admin, period)
    expect(second.body).toMatchObject({ created: 3, skipped: 0 })
    charges = (await listCharges(request, admin, '')).filter((charge) => charge.status === 'open')
    expect(chargeOf(charges, kuba, campFee)).toMatchObject({
      discountAmount: 27000,
      amountDue: 63000,
      discountRuleId: rule,
    })

    // The next month charges the monthly fees again but not the camp.
    const next = await generate(request, admin, periodFromNow(2))
    expect(next.body).toMatchObject({ created: 2, skipped: 1 })
    expect(
      (await listCharges(request, admin, '&period=one_off')).filter((charge) => charge.status === 'open'),
    ).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
