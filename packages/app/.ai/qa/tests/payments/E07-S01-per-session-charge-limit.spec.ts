import { expect, test } from '@playwright/test'
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
import { chargeOf, createFee, generate, listCharges, periodFromNow, type CodedBody } from '../_fixtures/payments'

// E07-S01 (issue #185): a per-session fee is charged `amount × sessions of the month`. A charge above the amount limit
// (`MAX_AMOUNT`, PLN 100 000 = 10 000 000 grosz) used to overflow the `int` amount column and fail the generation with
// a 500. Two sessions of a fee at the limit now refuse the generation with the coded 422 `charge_amount_over_limit`
// and persist no charge; with the fee halved the charge is exactly at the limit and is created.
test.describe.configure({ timeout: 300_000 })

const MAX_AMOUNT = 10_000_000

test('E07-S01 a per-session charge above the amount limit is refused with 422, one at the limit is charged', async ({
  request,
}) => {
  const club = await createClub(request, 'e07-s01-limit')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const period = periodFromNow(1)
    const section = await createStructure(request, admin, 'sections', { name: 'Tenis' })
    const court = await createStructure(request, admin, 'places', { name: 'Hala', kind: 'hall', capacityGroups: 1 })
    const group = await createGroup(request, admin, {
      sectionId: section,
      name: 'Tenis — dorośli',
      kind: 'class_group',
    })
    const adam = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Nowak',
      birthDate: birthDateTurning(35),
    })
    await addMembership(request, admin, { groupId: group, personId: adam, role: 'participant', validFrom: today })
    for (const day of ['10', '20']) {
      const { sessionsCreated } = await createActivity(request, admin, {
        groupId: group,
        name: `Kort ${day}`,
        type: 'training',
        placeId: court,
        startsOn: `${period}-${day}`,
        startTime: '18:00',
        endTime: '19:00',
      })
      expect(sessionsCreated).toBe(1)
    }
    const fee = await createFee(request, admin, {
      name: 'Kort',
      groupId: group,
      period: 'per_occurrence',
      amount: MAX_AMOUNT,
      dueDay: 1,
      validFrom: today,
    })

    // 2 sessions × MAX_AMOUNT exceeds the limit: refused before anything is persisted.
    const refused = await generate(request, admin, period)
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body?.code).toBe('charge_amount_over_limit')
    expect(await listCharges(request, admin, '')).toEqual([])

    // Halved, the charge is exactly MAX_AMOUNT and is created.
    const rows = await call<{ items?: Array<{ id: string; updatedAt?: string | null }> }>(
      request,
      'GET',
      `/api/payments/fees?groupId=${group}`,
      admin,
    )
    const lock = rows.body?.items?.find((item) => item.id === fee)?.updatedAt
    expect(lock, 'lock token of the Kort fee').toBeTruthy()
    const lowered = await call<CodedBody>(request, 'PUT', '/api/payments/fees', admin, {
      data: { id: fee, amount: MAX_AMOUNT / 2 },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(lock) },
    })
    expect(lowered.status, JSON.stringify(lowered.body)).toBe(200)
    const generated = await generate(request, admin, period)
    expect(generated.status, JSON.stringify(generated.body)).toBe(200)
    expect(generated.body).toMatchObject({ created: 1, skipped: 0 })
    expect(chargeOf(await listCharges(request, admin, ''), adam, fee)).toMatchObject({
      amount: MAX_AMOUNT,
      periodLabel: period,
      payerPersonId: adam,
    })
  } finally {
    await club.cleanup()
  }
})
