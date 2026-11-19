import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { addDays } from '../_fixtures/activities'
import { memberAccount, type Member } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createPerson, mercato, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { capturedEmails, getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L8 (#310; REQ-L07, J-L05, AC-L08): TEST-L10 — a child who reaches the club's account
// age (16) today and a 14-year-old sibling. The daily job `people life-cycle` run the day before tells nobody; run on
// the day twice it sends one account-age notice to the guardian and one to the administrators (no birth date in the
// e-mail); B-09 "Needs attention → May get an account" lists the child and the dashboard widget "People needing
// attention" counts it with a link to that filter; after the club lowers the threshold to 14, the next run tells only
// the newly eligible sibling. The guardian's ward card shows "May have an own account — ask the club" at 375 px in
// Polish and English, light and dark (axe), and so does the ward page. The filter is the administrator's: a guardian
// gets 403.
test.describe.configure({ timeout: 420_000 })

type LifeCycleResult = { counts: { accountAge: number; failed: number } }

function lifeCycle(club: Club, today: string): LifeCycleResult {
  return mercato([
    'people',
    'life-cycle',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--today',
    today,
  ]) as LifeCycleResult
}

async function recipients(club: Club, key: string): Promise<string[]> {
  return withClient(async (client) => {
    const rows = await client.query<{ person_id: string | null }>(
      `select distinct r.person_id
         from foundation_dispatches d join foundation_deliveries r on r.dispatch_id = d.id
        where d.tenant_id = $1 and d.organization_id = $2 and d.idempotency_key = $3`,
      [club.tenant.tenantId, club.tenant.organizationId, key],
    )
    return rows.rows.flatMap((row) => (row.person_id ? [row.person_id] : [])).sort()
  })
}

async function keysOf(club: Club, personId: string): Promise<string[]> {
  return withClient(async (client) => {
    const rows = await client.query<{ key: string }>(
      `select idempotency_key as key from foundation_dispatches
        where tenant_id = $1 and organization_id = $2 and idempotency_key like $3 order by idempotency_key`,
      [club.tenant.tenantId, club.tenant.organizationId, `people:account-age:${personId}:%`],
    )
    return rows.rows.map((row) => row.key)
  })
}

async function attentionIds(request: Parameters<typeof call>[0], token: string, filter: string) {
  const result = await call<{ items?: Array<{ id: string }>; total?: number }>(
    request,
    'GET',
    `/api/people/persons?attention=${filter}&pageSize=100`,
    token,
  )
  return { status: result.status, ids: (result.body?.items ?? []).map((item) => item.id), total: result.body?.total }
}

type Family = {
  club: Club
  guardianId: string
  guardian: Member
  child: string
  sibling: string
  childBirthDate: string
}

/** A guardian with an account, a child who turns 16 today and a sibling who turned 14 three days ago; threshold 16. */
async function familyOf(request: APIRequestContext, label: string): Promise<Family> {
  const club = await createClub(request, label)
  const admin = club.adminToken
  expect((await updateClubSettings(request, admin, { ownAccountMinAge: 16 })).status).toBe(200)
  const guardianId = await createPerson(request, admin, {
    firstName: 'Kasia',
    lastName: 'Lis',
    birthDate: birthDateTurning(41),
  })
  const childBirthDate = birthDateTurning(16)
  const child = await createPerson(request, admin, { firstName: 'Jan', lastName: 'Lis', birthDate: childBirthDate })
  const sibling = await createPerson(request, admin, {
    firstName: 'Ola',
    lastName: 'Lis',
    birthDate: birthDateTurning(14, -3),
  })
  for (const wardPersonId of [child, sibling]) {
    await createGuardianship(request, admin, {
      guardianPersonId: guardianId,
      wardPersonId,
      isPrimaryPayer: wardPersonId === child,
      validFrom: addDays(calendarDate(), -100),
    })
  }
  const guardian = await memberAccount(request, club, guardianId, 'kasia-l10')

  return { club, guardianId, guardian, child, sibling, childBirthDate }
}

test('TEST-L10 a child reaching the account age: one notice, the list, a lowered threshold tells only the newly eligible', async ({
  request,
}) => {
  const { club, guardianId, guardian, child, sibling, childBirthDate } = await familyOf(request, 'test-l10-account-age')
  try {
    const admin = club.adminToken
    // The day before: nobody has reached 16.
    expect(lifeCycle(club, addDays(calendarDate(), -1)).counts.accountAge).toBe(0)
    expect(await keysOf(club, child)).toEqual([])

    // On the day, twice: one notice to the guardian, one to the administrators.
    const first = lifeCycle(club, calendarDate())
    expect(first.counts).toMatchObject({ accountAge: 1, failed: 0 })
    expect(lifeCycle(club, calendarDate()).counts.accountAge).toBe(0)
    const key = `people:account-age:${child}:16`
    expect(await keysOf(club, child)).toEqual([key, `${key}:admins`])
    expect(await recipients(club, key)).toEqual([guardianId])
    expect(await recipients(club, `${key}:admins`)).toEqual([club.adminPersonId])
    await expect.poll(() => capturedEmails(guardian.email).length, { timeout: 60_000 }).toBeGreaterThan(0)
    for (const email of capturedEmails(guardian.email)) {
      expect(email.text).not.toContain(childBirthDate)
    }

    // B-09 "May get an account" lists the child, not the 14-year-old; the guardian may not read the list.
    const listed = await attentionIds(request, admin, 'account_age')
    expect(listed.status).toBe(200)
    expect(listed.ids).toContain(child)
    expect(listed.ids).not.toContain(sibling)
    expect((await attentionIds(request, guardian.token, 'account_age')).status).toBe(403)

    // The club lowers the threshold to 14: only the newly eligible sibling is told.
    expect((await updateClubSettings(request, admin, { ownAccountMinAge: 14 })).status).toBe(200)
    expect(lifeCycle(club, calendarDate()).counts.accountAge).toBe(1)
    expect(await keysOf(club, sibling)).toEqual([
      `people:account-age:${sibling}:14`,
      `people:account-age:${sibling}:14:admins`,
    ])
    expect(await keysOf(club, child)).toEqual([key, `${key}:admins`])
    expect(lifeCycle(club, calendarDate()).counts.accountAge).toBe(0)
    const both = await attentionIds(request, admin, 'account_age')
    expect(both.ids).toEqual(expect.arrayContaining([child, sibling]))
  } finally {
    await club.cleanup()
  }
})

test('TEST-L10 the widget counts the child and the ward card says it may have an account at 375 px', async ({
  page,
  request,
}, testInfo) => {
  const { club, guardian, child } = await familyOf(request, 'test-l10-account-age-ui')
  try {
    expect(lifeCycle(club, calendarDate()).counts.accountAge).toBe(1)
    const total = (await attentionIds(request, club.adminToken, 'account_age')).total
    // The dashboard widget counts the filter and links to it.
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend')
    const accountRow = page.getByTestId('people-needing-attention-account_age')
    await expect(accountRow).toBeVisible()
    await expect(accountRow).toContainText(String(total))
    await expect(accountRow).toHaveAttribute('href', '/backend/people/persons?attention=account_age')

    // The guardian's ward card and the ward page at 375 px, in Polish and English, light and dark.
    const password = await switchBrowserUser(page, request, club, guardian.userId, guardian.email)
    const guardianToken = await getAuthToken(request, guardian.email, password)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const me = await getMe(request, guardianToken)
      const saved = await putMe(request, guardianToken, { preferredLocale: locale }, String(me.body?.person?.updatedAt))
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto('/club/profile')
      const card = page.getByTestId('club-profile-ward').filter({ hasText: 'Jan' })
      const line = card.getByTestId('club-ward-notice-may_have_account')
      await expect(line).toContainText(uiText('people.club.wards.notices.mayHaveAccount'))
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/profile ward card (${locale})`,
          async () => {
            await expect(line).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
      await page.goto(`/club/wards/${child}`)
      await expect(page.getByTestId('club-ward-notice-may_have_account')).toContainText(
        uiText('people.club.wards.notices.mayHaveAccount'),
      )
      await expectNoPageOverflow(page)
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
