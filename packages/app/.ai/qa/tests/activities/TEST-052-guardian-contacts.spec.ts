import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { bothSeries, familyFor, firstSession } from '../_fixtures/attendance'
import { call, createClub, mercato } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'

// Issue #34 (E03-S05), club spec TEST-052 (REQ-037, DD-39) with foundation II TEST-G05 (P-27, P-28): guardian A
// consented to share their contacts with coaches, guardian B did not. The coach of the children's group reads A's phone
// and e-mail and nothing of B; a coach of another group and the section's coordinator get 403; after A withdraws the
// consent in the profile the next read is empty. Every read commits one `activities_contact_access_log` row with the
// actor, role, session and person ids — never the values — and the append-only guard refuses to change or delete it.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type ContactsPage = {
  items?: {
    personId: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
    wards: { personId: string; firstName: string; lastName: string }[]
  }[]
  total?: number
  code?: string
}

type LogRow = {
  id: string
  actorUserId: string
  actingRole: string
  occurrenceId: string
  resourceKind: string
  resourceIds: string[]
  purpose: string
}

const A_PHONE = '+48 600 100 200'
const B_PHONE = '+48 600 300 400'

function readContacts(request: Parameters<typeof call>[0], token: string, occurrenceId: string) {
  return call<ContactsPage>(request, 'GET', `/api/activities/occurrences/${occurrenceId}/guardian-contacts`, token)
}

test('TEST-052 the coach sees only the consenting guardian, other coaches and the coordinator get 403, withdrawal hides the contacts, every read is logged with ids only and the log is append-only', async ({
  request,
}) => {
  const club = await createClub(request, 'test-052')
  try {
    const family = await familyFor(request, club)
    const { training } = await bothSeries(request, club, family)
    const session = firstSession(training.sessions)

    // Guardian A (the Kowalski children) consents and gives a phone; guardian B (the Nowak child) gives a phone only.
    const meA = await getMe(request, family.guardian.token)
    const consented = await putMe(
      request,
      family.guardian.token,
      { shareContactWithCoaches: true, phone: A_PHONE },
      meA.body?.person.updatedAt,
    )
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    const meB = await getMe(request, family.other.guardian.token)
    const phoneOnly = await putMe(request, family.other.guardian.token, { phone: B_PHONE }, meB.body?.person.updatedAt)
    expect(phoneOnly.status, JSON.stringify(phoneOnly.body)).toBe(200)

    // The coach of Żaki: A's phone and e-mail with both wards; nothing of B.
    const read = await readContacts(request, family.coach.token, session.id)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body?.items).toHaveLength(1)
    const contact = read.body?.items?.[0]
    expect(contact).toMatchObject({ personId: family.guardian.personId, phone: A_PHONE, email: family.guardian.email })
    expect(contact?.wards.map((ward) => ward.personId).sort()).toEqual(
      [family.younger.personId, family.elder.personId].sort(),
    )
    expect(JSON.stringify(read.body)).not.toContain(B_PHONE)

    // A coach of another group and the section's coordinator: 403, nothing returned.
    for (const token of [family.instructor.token, family.academyCoordinator.token]) {
      const refused = await readContacts(request, token, session.id)
      expect(refused.status, JSON.stringify(refused.body)).toBe(403)
      expect(refused.body?.code).toBe('scope_denied')
      expect(JSON.stringify(refused.body)).not.toContain(A_PHONE)
    }

    // A withdraws the consent in the profile: the next read is empty.
    const meA2 = await getMe(request, family.guardian.token)
    const withdrawn = await putMe(
      request,
      family.guardian.token,
      { shareContactWithCoaches: false },
      meA2.body?.person.updatedAt,
    )
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    const after = await readContacts(request, family.coach.token, session.id)
    expect(after.status, JSON.stringify(after.body)).toBe(200)
    expect(after.body?.items).toEqual([])

    // Two reads, two log rows (the refused reads never reached the read): actor, role, session, ids — no values.
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
    const log = mercato(['activities', 'contact-access-log', ...scope, '--occurrence', session.id]) as {
      rows?: LogRow[]
    }
    expect(log.rows).toHaveLength(2)
    const [second, first] = log.rows ?? []
    if (!first || !second) throw new Error('[test] two log rows expected')
    for (const row of [first, second]) {
      expect(row).toMatchObject({
        actorUserId: family.coach.userId,
        actingRole: 'coach',
        occurrenceId: session.id,
        resourceKind: 'people:person',
        purpose: 'coach_contacts',
      })
    }
    expect(first.resourceIds).toEqual([family.guardian.personId])
    expect(second.resourceIds).toEqual([])
    const serialized = JSON.stringify(log)
    expect(serialized).not.toContain(A_PHONE)
    expect(serialized).not.toContain(family.guardian.email)

    // The log is append-only: a change and a delete are both refused.
    const probe = mercato(['activities', 'check-append-only', ...scope]) as {
      rowId?: string | null
      update?: string | null
      delete?: string | null
    }
    expect(probe).toEqual({ rowId: second.id, update: 'append_only', delete: 'append_only' })
    const unchanged = mercato(['activities', 'contact-access-log', ...scope, '--occurrence', session.id]) as {
      rows?: LogRow[]
    }
    expect(unchanged.rows).toEqual(log.rows)
  } finally {
    await club.cleanup()
  }
})

test('TEST-052 the coach opens the contacts on the attendance list on a phone: nothing is read until asked, then the consenting guardian with tap-to-call; axe in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-052-ui')
  try {
    const family = await familyFor(request, club)
    const { training } = await bothSeries(request, club, family)
    const session = firstSession(training.sessions)
    const me = await getMe(request, family.guardian.token)
    const consented = await putMe(
      request,
      family.guardian.token,
      { shareContactWithCoaches: true, phone: A_PHONE },
      me.body?.person.updatedAt,
    )
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${session.id}/attendance`)
    const section = page.getByTestId('club-contacts')
    await expect(section).toBeVisible()
    // Opening the list reads nothing: the contacts load only when the coach asks.
    const before = mercato(['activities', 'contact-access-log', ...scope]) as { rows?: unknown[] }
    expect(before.rows).toEqual([])

    await section.getByRole('button', { name: /Show guardians' contacts|Pokaż kontakty opiekunów/ }).click()
    const contact = section.getByTestId('club-contact')
    await expect(contact).toHaveCount(1)
    await expect(contact).toContainText(family.guardian.email)
    const phone = contact.getByTestId('club-contact-phone')
    await expect(phone).toHaveText(A_PHONE)
    await expect(phone).toHaveAttribute('href', 'tel:+48600100200')
    const logged = mercato(['activities', 'contact-access-log', ...scope]) as { rows?: unknown[] }
    expect(logged.rows).toHaveLength(1)

    const violations: Record<string, unknown> = {}
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`contacts (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 320, height: 720 })
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
