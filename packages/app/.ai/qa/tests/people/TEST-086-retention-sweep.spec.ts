import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  mercato,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { getCharge, recordPayment } from '../_fixtures/payments'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-086 (club spec REQ-041, amendment B; AC-041; #471): the club setting `former_participant_retention_months`
// (default 12, 1–120) and the daily `people:retention-sweep`. Four former persons: one whose last membership ended 13
// months ago with a paid charge, one who left as long ago with an open (unpaid) charge — the owner's "retention hold" —
// one who left as long ago but is still the guardian of a ward in the club, and one who left 6 months ago. The club
// administrator sets 24 months on the club settings page (desktop in English, 375 px in Polish): the sweep anonymises
// nobody. Back at 12 months, the sweep anonymises only the first person, with one audit entry (reason
// `retention_sweep`), and their payment stays exactly as it was and still linked to them; the other three are unchanged
// and a second run changes nothing. A period outside 1–120 answers 422 on the field. Departures 13 months back cannot be
// recorded through the API (the last day is today or later), so the test dates them in SQL, as a departure that long
// ago would have left them: `left_on` and the membership's end.
test.describe.configure({ timeout: 420_000 })

type SweepResult = {
  today: string
  dryRun: boolean
  months: number
  cutoff: string
  counts: { candidates: number; anonymized: number; kept: number; failed: number }
}

function sweep(club: Club, dryRun = false): SweepResult {
  return mercato([
    'people',
    'retention-sweep',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    ...(dryRun ? ['--dry-run'] : []),
  ]) as SweepResult
}

/** Dates a departure in the past: the person's `left_on` (and nothing else). */
async function leftOn(club: Club, personIds: string[], day: string): Promise<void> {
  await withClient(async (client) => {
    await client.query('update people_persons set left_on = $3 where tenant_id = $1 and id = any($2::uuid[])', [
      club.tenant.tenantId,
      personIds,
      day,
    ])
  })
}

type PersonRow = { anonymized_at: string | null; email: string | null; phone: string | null; birth_date: string | null }

async function personRows(club: Club, personIds: string[]): Promise<Map<string, PersonRow>> {
  return withClient(async (client) => {
    const rows = await client.query<PersonRow & { id: string }>(
      `select id, anonymized_at::text, email, phone, birth_date::text
         from people_persons where tenant_id = $1 and id = any($2::uuid[])`,
      [club.tenant.tenantId, personIds],
    )
    return new Map(rows.rows.map(({ id, ...row }) => [id, row]))
  })
}

async function paymentRows(club: Club, chargeId: string) {
  return withClient(async (client) => {
    const rows = await client.query(
      `select p.id, p.amount, p.method, p.paid_on::text, c.person_id, c.payer_person_id
         from payments_payments p join payments_charges c on c.id = p.charge_id
        where p.tenant_id = $1 and p.charge_id = $2 order by p.id`,
      [club.tenant.tenantId, chargeId],
    )
    return rows.rows
  })
}

async function addCharge(request: APIRequestContext, token: string, personId: string, amount: number) {
  const created = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', token, {
    data: { personId, description: 'Składka', amount, dueDate: calendarDate(7) },
  })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return String(created.body?.chargeId)
}

const RETENTION_FIELD = '[data-crud-field-id="formerParticipantRetentionMonths"]'

/** Opens the club settings page in `locale` and checks the retention field shows `months`. */
async function openSettings(page: Page, locale: 'en' | 'pl', months: number) {
  await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
  await page.goto('/backend/club/settings')
  await expect(page.getByText(uiTextIn(locale, 'club_core.settings.groups.retention'), { exact: true })).toBeVisible()
  // The label carries the required marker (" *"), so it is matched inside the field, not as the whole text.
  await expect(page.locator(RETENTION_FIELD)).toContainText(
    uiTextIn(locale, 'club_core.settings.fields.formerParticipantRetentionMonths'),
  )
  const input = page.locator(`${RETENTION_FIELD} input`)
  await input.scrollIntoViewIfNeeded()
  await expect(input).toBeVisible()
  await expect(input).toHaveValue(String(months))
  return input
}

test('TEST-086 former participants are anonymised after the club retention period, kept with an open charge, a guardianship or a longer period', async ({
  request,
  page,
}) => {
  const club = await createClub(request, 'test-086')
  try {
    const suffix = uniqueSuffix()
      .replace(/[^a-z]/gi, '')
      .slice(0, 6)
    const admin = club.adminToken
    const thirteenMonthsAgo = calendarDate(-400)
    const sixMonthsAgo = calendarDate(-183)
    const section = await create(request, admin, 'sections', { name: `Sekcja ${suffix}` })
    const group = await createGroup(request, admin, { sectionId: section, name: `Seniorzy ${suffix}`, kind: 'team' })

    // A: former participant, membership ended 13 months ago, a charge paid in full.
    const former = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: `Były${suffix}`,
      birthDate: birthDateTurning(30),
      email: `adam-${suffix}@example.org`,
      phone: '+48600100200',
    })
    // B: left as long ago, an open charge (the retention hold).
    const debtor = await createPerson(request, admin, {
      firstName: 'Bogdan',
      lastName: `Dłużnik${suffix}`,
      birthDate: birthDateTurning(31),
      email: `bogdan-${suffix}@example.org`,
    })
    // C: left as long ago, still the guardian of a ward who is in the club.
    const guardian = await createPerson(request, admin, {
      firstName: 'Celina',
      lastName: `Opiekunka${suffix}`,
      birthDate: birthDateTurning(40),
      email: `celina-${suffix}@example.org`,
    })
    const ward = await createPerson(request, admin, {
      firstName: 'Czesio',
      lastName: `Opiekunka${suffix}`,
      birthDate: birthDateTurning(9),
    })
    // D: left 6 months ago.
    const recent = await createPerson(request, admin, {
      firstName: 'Dorota',
      lastName: `Niedawna${suffix}`,
      birthDate: birthDateTurning(28),
      email: `dorota-${suffix}@example.org`,
    })
    for (const personId of [former, debtor]) {
      await addMembership(request, admin, {
        groupId: group,
        personId,
        role: 'participant',
        validFrom: calendarDate(-800),
        validTo: thirteenMonthsAgo,
      })
    }
    await addMembership(request, admin, {
      groupId: group,
      personId: recent,
      role: 'participant',
      validFrom: calendarDate(-800),
      validTo: sixMonthsAgo,
    })
    await addMembership(request, admin, {
      groupId: group,
      personId: ward,
      role: 'participant',
      validFrom: calendarDate(-30),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: guardian,
      wardPersonId: ward,
      relation: 'parent',
      isPrimaryPayer: false,
      validFrom: calendarDate(-30),
    })
    const paidCharge = await addCharge(request, admin, former, 10_000)
    const paid = await recordPayment(
      request,
      admin,
      paidCharge,
      (await getCharge(request, admin, paidCharge)).updatedAt,
      {
        amount: 10_000,
        method: 'transfer',
        paidOn: calendarDate(),
      },
    )
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
    await addCharge(request, admin, debtor, 8_000)
    await leftOn(club, [former, debtor, guardian], thirteenMonthsAgo)
    await leftOn(club, [recent], sixMonthsAgo)
    const everyone = [former, debtor, guardian, recent]
    const before = await personRows(club, everyone)
    const paymentsBefore = await paymentRows(club, paidCharge)
    expect(paymentsBefore).toHaveLength(1)

    // The setting reads its default; outside 1–120 is refused on the field.
    const defaults = await call<{ formerParticipantRetentionMonths?: number }>(
      request,
      'GET',
      '/api/club_core/settings',
      admin,
    )
    expect(defaults.body?.formerParticipantRetentionMonths).toBe(12)
    for (const months of [0, 121]) {
      const refused = await updateClubSettings(request, admin, { formerParticipantRetentionMonths: months })
      expect(refused.status, JSON.stringify(refused.body)).toBe(422)
      expect(refused.body).toMatchObject({
        code: 'retention_months_out_of_range',
        fieldErrors: { formerParticipantRetentionMonths: expect.any(String) },
      })
    }

    // The administrator sets 24 months on the settings page: desktop in English, then checks it at 375 px in Polish.
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await page.goto('/backend')
    await page.setViewportSize({ width: 1280, height: 900 })
    const input = await openSettings(page, 'en', 12)
    await expect(page.getByText(uiTextIn('en', 'club_core.settings.groups.retention.description'))).toBeVisible()
    await input.fill('24')
    const saved = page.waitForResponse(
      (response) => response.url().includes('/api/club_core/settings') && response.request().method() === 'PUT',
    )
    await page
      .getByRole('button', { name: uiTextIn('en', 'club_core.settings.save'), exact: true })
      .first()
      .click()
    expect((await saved).status()).toBe(200)
    await page.setViewportSize({ width: 375, height: 812 })
    await openSettings(page, 'pl', 24)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal scroll at 375 px').toBeLessThanOrEqual(1)

    // At 24 months nobody who left 13 months ago is a candidate.
    const longer = sweep(club)
    expect(longer).toMatchObject({ months: 24, counts: { candidates: 0, anonymized: 0, kept: 0, failed: 0 } })
    expect(await personRows(club, everyone)).toEqual(before)

    // Back at 12 months: a dry run counts and changes nothing, then the sweep anonymises only A.
    const reset = await updateClubSettings(request, club.adminToken, { formerParticipantRetentionMonths: 12 })
    expect(reset.status, JSON.stringify(reset.body)).toBe(200)
    const dry = sweep(club, true)
    expect(dry).toMatchObject({
      dryRun: true,
      months: 12,
      counts: { candidates: 3, anonymized: 1, kept: 2, failed: 0 },
    })
    expect(await personRows(club, everyone)).toEqual(before)

    const first = sweep(club)
    expect(first).toMatchObject({
      dryRun: false,
      months: 12,
      counts: { candidates: 3, anonymized: 1, kept: 2, failed: 0 },
    })
    const after = await personRows(club, everyone)
    expect(after.get(former)).toMatchObject({ email: null, phone: null, birth_date: null })
    expect(after.get(former)?.anonymized_at).not.toBeNull()
    for (const personId of [debtor, guardian, recent]) expect(after.get(personId)).toEqual(before.get(personId))
    // The payment stays exactly as it was and still points to the anonymised person.
    expect(await paymentRows(club, paidCharge)).toEqual(paymentsBefore)
    expect(paymentsBefore[0]).toMatchObject({ person_id: former })

    // One audit entry, with the reason and what was kept; never an erased value. It is the system actor's, so the
    // administrator reads it with `audit_logs.view_tenant` (without it they list only their own entries).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'],
    })
    const entries = (await actionLogEntries(request, club.adminToken, former)).filter(
      (entry) => entry.commandId === 'people.persons.anonymize',
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].context).toMatchObject({ reason: 'retention_sweep', requestId: null, actingRole: 'system' })
    const kept = (entries[0].context?.keptData ?? []) as { category: string }[]
    expect(kept.map((entry) => entry.category)).toContain('accounting_records')
    expect(kept.map((entry) => entry.category)).not.toContain('erasure_request_and_decision')
    expect(JSON.stringify(entries[0].context)).not.toContain(`adam-${suffix}@example.org`)

    // A second run changes nothing: A is no longer a candidate.
    const second = sweep(club)
    expect(second).toMatchObject({ counts: { candidates: 2, anonymized: 0, kept: 2, failed: 0 } })
    expect(await personRows(club, everyone)).toEqual(after)
    expect(
      (await actionLogEntries(request, club.adminToken, former)).filter(
        (entry) => entry.commandId === 'people.persons.anonymize',
      ),
    ).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
