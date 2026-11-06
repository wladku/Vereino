import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  createEvent,
  juneThirtiethNextYear,
  listOccurrences,
  nextWeekday,
  zoneInstant,
} from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, getGroup, signedInStaff, updateGroup } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { publicGet, publish, putSectionPublic, type PublicationBlock } from '../_fixtures/publication'

// TEST-037, the `groups` and `activities` blocks (club spec phase 2 step 9, REQ-025, AC-025, DD-28, DD-29; issue #91,
// E06-S09): a public team with a Tuesday and Thursday 17:00 series and a non-public team with its own series and event.
// The section page carries a card per public group with its age, days, time, place and next three sessions (a
// cancelled one marked), and the club page the upcoming one-off events of public groups only. The instructor is
// "Section coach" without consent — the API carries no name — and "First L." once the coach gives the consent through
// `PUT /api/people/me`; with the `coaches` block off no instructor is sent at all; with `description_schedule` off
// neither block is sent. An age range 10–8 answers 422 on `ageTo`. The browser renders both pages at 375 px with no
// blocking axe violation, and the group record's "Public page" tab shows the 422 on the "Age to" field.
test.describe.configure({ timeout: 300_000 })

type Session = { date: string; startTime: string; endTime: string; place: string | null; cancelled: boolean }
type GroupCard = {
  id: string
  name: string
  kind: string
  ageFrom: number | null
  ageTo: number | null
  level: string | null
  description: string | null
  conditions?: string | null
  instructors?: { name: string | null }[]
}
type SectionBlocks = {
  groups?: { items: GroupCard[] }
  schedule?: {
    groups: {
      groupId: string
      series: { weekdays: string[]; startTime: string; endTime: string; place: string | null }[]
      upcoming: Session[]
    }[]
  }
}
type ClubBlocks = { schedule?: { events: (Session & { name: string; type: string; section: { slug: string } })[] } }

const ALL_BLOCKS: PublicationBlock[] = ['description_schedule', 'conditions', 'coaches', 'contact']

async function sectionBlocks(
  request: APIRequestContext,
  slug: string,
): Promise<{ blocks: SectionBlocks; json: string }> {
  const result = await publicGet(request, `/api/club_core/public/${slug}/sections/basen`)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return { blocks: (result.body as { blocks: SectionBlocks }).blocks, json: JSON.stringify(result.body) }
}

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-037 public groups with their schedule, next sessions, instructor consent and events; disabled blocks absent; age range 422', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-037-groups')
  try {
    const admin = club.adminToken
    const slug = `t037g-${uniqueSuffix()}`
    const pool = await create(request, admin, 'sections', { name: 'Basen' })
    expect((await putSectionPublic(request, admin, pool, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    const hall = await create(request, admin, 'places', { name: 'Pływalnia miejska', kind: 'hall' })
    const orliki = await createGroup(request, admin, { sectionId: pool, name: 'Orliki', kind: 'team' })
    const zaki = await createGroup(request, admin, { sectionId: pool, name: 'Żaki', kind: 'team' })

    // The public fields: an inverted age range answers 422 on `ageTo`; a valid one is stored with the rest.
    const before = await getGroup(request, admin, orliki)
    const inverted = await updateGroup(
      request,
      admin,
      { id: orliki, isPublic: true, ageFrom: 10, ageTo: 8 },
      String(before.body?.updatedAt),
    )
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body).toMatchObject({
      code: 'group_age_range_inverted',
      fieldErrors: { ageTo: expect.any(String) },
    })
    const saved = await updateGroup(
      request,
      admin,
      {
        id: orliki,
        isPublic: true,
        publicDescription: 'Pływanie dla dzieci.',
        publicConditions: 'Strój kąpielowy i czepek.',
        ageFrom: 8,
        ageTo: 10,
        levelLabel: 'początkujący',
      },
      String(before.body?.updatedAt),
    )
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await getGroup(request, admin, orliki)).body).toMatchObject({ isPublic: true, ageFrom: 8, ageTo: 10 })
    expect((await getGroup(request, admin, zaki)).body).toMatchObject({ isPublic: false })

    // The coach of Orliki, without the publish-name consent yet.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trenerski', role: 'coach' })
    const today = calendarDate()
    await addMembership(request, admin, { groupId: orliki, personId: coach.personId, role: 'coach', validFrom: today })

    // A Tuesday and Thursday 17:00 series for both groups; the second Orliki session is cancelled.
    const tuesday = nextWeekday(addDays(today, 1), 'TU')
    const series = {
      type: 'training',
      placeId: hall,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: tuesday,
      startTime: '17:00',
      endTime: '18:00',
    }
    const orlikiSeries = await createActivity(request, admin, { ...series, groupId: orliki, name: 'Trening Orlików' })
    await createActivity(request, admin, {
      ...series,
      groupId: zaki,
      name: 'Trening Żaków',
      startTime: '18:00',
      endTime: '19:00',
    })
    const sessions = (await listOccurrences(request, admin, `&activityId=${orlikiSeries.id}`)).items
    expect(sessions.length).toBeGreaterThanOrEqual(3)
    const cancelled = sessions[1]
    const cancel = await cancelOccurrence(request, admin, cancelled.id, 'Basen zamknięty', cancelled.updatedAt)
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200)

    // One-off events: Orliki's is public, Żaki's is not.
    const saturday = nextWeekday(addDays(today, 3), 'SA')
    for (const [groupId, name, start, end] of [
      [orliki, 'Zawody Orlików', '09:00', '13:00'],
      [zaki, 'Zawody Żaków', '14:00', '16:00'],
    ]) {
      const event = await createEvent(request, admin, {
        groupId,
        type: 'tournament',
        name,
        placeId: hall,
        startsAt: zoneInstant(saturday, start),
        endsAt: zoneInstant(saturday, end),
      })
      expect(event.status, JSON.stringify(event.body)).toBe(201)
    }

    await publish(request, admin, slug, ALL_BLOCKS, { shortName: 'Klub Delfin' })

    // The section page: one card (Orliki), its days, time, place, next three sessions with the cancellation, and
    // "Section coach" — no name in the response.
    const first = await sectionBlocks(request, slug)
    expect(first.blocks.groups?.items).toEqual([
      {
        id: orliki,
        name: 'Orliki',
        kind: 'team',
        description: 'Pływanie dla dzieci.',
        ageFrom: 8,
        ageTo: 10,
        level: 'początkujący',
        conditions: 'Strój kąpielowy i czepek.',
        instructors: [{ name: null }],
      },
    ])
    expect(first.blocks.schedule?.groups.map((item) => item.groupId)).toEqual([orliki])
    const schedule = first.blocks.schedule?.groups[0]
    expect(schedule?.series).toEqual([
      { weekdays: ['TU', 'TH'], startTime: '17:00', endTime: '18:00', place: 'Pływalnia miejska' },
    ])
    expect(schedule?.upcoming.map((item) => [item.date, item.startTime, item.cancelled])).toEqual(
      sessions.slice(0, 3).map((item, index) => [item.occurrenceDate, '17:00', index === 1]),
    )
    expect(first.json).not.toContain('Żak')
    expect(first.json).not.toContain('Marek')
    expect(first.json).not.toContain('Trenerski')
    expect(first.json).not.toContain(coach.personId)

    // The club page: the public group's event only, with date, place, section and type.
    const clubPage = await publicGet(request, `/api/club_core/public/${slug}`)
    expect(clubPage.status).toBe(200)
    const events = (clubPage.body as { blocks: ClubBlocks }).blocks.schedule?.events
    expect(events).toEqual([
      {
        name: 'Zawody Orlików',
        type: 'tournament',
        section: { name: 'Basen', slug: 'basen' },
        date: saturday,
        startTime: '09:00',
        endTime: '13:00',
        place: 'Pływalnia miejska',
        cancelled: false,
      },
    ])
    expect(JSON.stringify(clubPage.body)).not.toContain('Żak')

    // The coach gives the consent in their profile: the card shows "Marek T.", never the full last name.
    const me = await getMe(request, coach.token)
    expect(me.status, JSON.stringify(me.body)).toBe(200)
    expect(me.body?.person.consents.publishNameConsent).toEqual({ granted: false, at: null })
    const consent = await putMe(request, coach.token, { publishNameConsent: true }, me.body?.person.updatedAt)
    expect(consent.status, JSON.stringify(consent.body)).toBe(200)
    expect(consent.body?.person?.consents.publishNameConsent.granted).toBe(true)
    const named = await sectionBlocks(request, slug)
    expect(named.blocks.groups?.items[0].instructors).toEqual([{ name: 'Marek T.' }])
    expect(named.json).not.toContain('Trenerski')

    // The browser: the card with its age, days, struck-through cancelled date and instructor; the club page's event.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'en')
    await page.goto(`/p/${slug}/sections/basen`)
    const card = page.getByTestId(`public-group-${orliki}`)
    await expect(card.getByRole('heading', { level: 3, name: 'Orliki' })).toBeVisible()
    await expect(card).toContainText('Age 8–10')
    await expect(card.getByTestId('public-group-series')).toContainText('Tue, Thu 17:00–18:00')
    await expect(card.getByTestId('public-group-series')).toContainText('Pływalnia miejska')
    await expect(card.getByTestId('public-group-upcoming').locator('s')).toHaveCount(1)
    await expect(card.getByTestId('public-group-upcoming')).toContainText('(cancelled)')
    await expect(card.getByTestId('public-group-instructors')).toContainText('Marek T.')
    await expectNoPageOverflow(page)
    const sectionViolations = await scanBlockingViolations(page, testInfo, {})
    await setGuestLocale(page, 'pl')
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-events').getByRole('heading', { level: 2 })).toHaveText(
      'Nadchodzące wydarzenia',
    )
    await expect(page.getByTestId('public-event')).toHaveCount(1)
    await expect(page.getByTestId('public-event')).toContainText('Zawody Orlików')
    await expect(page.getByTestId('public-event')).toContainText('Turniej')
    await expectNoPageOverflow(page)
    const clubViolations = await scanBlockingViolations(page, testInfo, {})
    expect({ section: sectionViolations, club: clubViolations }).toEqual({ section: [], club: [] })

    // The coaches block off: no instructor at all, named or not.
    await publish(request, admin, slug, ['description_schedule', 'conditions', 'contact'])
    const noCoaches = await sectionBlocks(request, slug)
    expect(noCoaches.blocks.groups?.items[0]).not.toHaveProperty('instructors')
    expect(noCoaches.json).not.toContain('Marek')
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(page.getByTestId(`public-group-${orliki}`)).toBeVisible()
    await expect(page.getByTestId('public-group-instructors')).toHaveCount(0)

    // The conditions block off: the requirements leave the card.
    await publish(request, admin, slug, ['description_schedule', 'contact'])
    expect((await sectionBlocks(request, slug)).blocks.groups?.items[0]).not.toHaveProperty('conditions')

    // The consent withdrawn: back to an anonymous instructor once the block is on again.
    const meAgain = await getMe(request, coach.token)
    const withdrawn = await putMe(request, coach.token, { publishNameConsent: false }, meAgain.body?.person.updatedAt)
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    await publish(request, admin, slug, ALL_BLOCKS)
    expect((await sectionBlocks(request, slug)).blocks.groups?.items[0].instructors).toEqual([{ name: null }])

    // `description_schedule` off: neither the groups nor the schedule block, on either page.
    await publish(request, admin, slug, ['conditions', 'coaches', 'contact'])
    const off = await sectionBlocks(request, slug)
    expect(off.blocks).not.toHaveProperty('groups')
    expect(off.blocks).not.toHaveProperty('schedule')
    expect(off.json).not.toContain('Orliki')
    const clubOff = await publicGet(request, `/api/club_core/public/${slug}`)
    expect((clubOff.body as { blocks: ClubBlocks }).blocks).not.toHaveProperty('schedule')

    // A group that is no longer public disappears from the page.
    await publish(request, admin, slug, ALL_BLOCKS)
    const current = await getGroup(request, admin, orliki)
    expect(
      (await updateGroup(request, admin, { id: orliki, isPublic: false }, String(current.body?.updatedAt))).status,
    ).toBe(200)
    const hidden = await sectionBlocks(request, slug)
    expect(hidden.blocks).not.toHaveProperty('groups')
    expect(hidden.blocks).not.toHaveProperty('schedule')
    expect(hidden.json).not.toContain('Orliki')

    // B-12 "Public page" tab: an inverted age range shows the server's 422 on the "Age to" field; a valid one saves.
    // Last, because signing the administrator in through the browser ends the API token used above.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const token = await getAuthToken(request, club.tenant.email, password)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/groups/groups/${orliki}`)
    await page.getByRole('tab', { name: /^Public page$|^Strona publiczna$/ }).click()
    const ageTo = page.locator('[data-crud-field-id="ageTo"]')
    await page.locator('[data-crud-field-id="ageFrom"] input').fill('10')
    await ageTo.locator('input').fill('8')
    await page
      .getByRole('button', { name: /^Save$|^Zapisz$/ })
      .first()
      .click()
    await expect(ageTo).toContainText(/cannot be lower|nie może być niższy/)
    expect((await getGroup(request, token, orliki)).body).toMatchObject({ ageFrom: 8, ageTo: 10 })
    await ageTo.locator('input').fill('12')
    await page
      .getByRole('button', { name: /^Save$|^Zapisz$/ })
      .first()
      .click()
    await expect
      .poll(async () => (await getGroup(request, token, orliki)).body)
      .toMatchObject({ ageFrom: 10, ageTo: 12 })
  } finally {
    await club.cleanup()
  }
})
