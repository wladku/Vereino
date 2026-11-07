import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { createGroup, getGroup, updateGroup } from '../_fixtures/groups'
import { createDiscountRule, createFee, periodFromNow } from '../_fixtures/payments'
import { publicGet, publish, putSectionPublic } from '../_fixtures/publication'

// TEST-038, the `payments.publicPrices` block (payments spec phase 4 step 6, REQ-026, AC-026; club spec DD-28, Q-024;
// issue #112, E07-S05): Basen's public group Orliki has a monthly fee of PLN 120 and the club a 30 % sibling discount;
// the non-public group Żaki has its own fee and Orliki a fee valid only from next month. With "Prices" published, the
// section page's `prices` block carries Orliki's current fee with the discount and nothing of Żaki or the future fee,
// and the card shows "120 zł / month · siblings −30%" at 375 px in both locales with no blocking axe violation. With
// "Prices" switched off (flow F-11) the response carries no price and the card no fee line. A club without `payments`
// has no `payments.publicPrices` registration, so `club_core` leaves the block out (DD-28 — no module, no block).
test.describe.configure({ timeout: 240_000 })

type GroupPrices = {
  groupId: string
  fees: { amount: number; currency: string; period: string; siblingDiscountPercent: number | null }[]
}
type SectionBlocks = { groups?: { items: { id: string }[] }; prices?: { groups: GroupPrices[] } }

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

test('TEST-038 the section page shows each public group fee and the sibling discount only while prices are published', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-038-prices')
  try {
    const admin = club.adminToken
    const slug = `t038-${uniqueSuffix()}`
    const today = calendarDate()
    const pool = await create(request, admin, 'sections', { name: 'Basen' })
    expect((await putSectionPublic(request, admin, pool, { isPublic: true, publicSlug: 'basen' })).status).toBe(200)
    const orliki = await createGroup(request, admin, { sectionId: pool, name: 'Orliki', kind: 'team' })
    const zaki = await createGroup(request, admin, { sectionId: pool, name: 'Żaki', kind: 'team' })
    const before = await getGroup(request, admin, orliki)
    const made = await updateGroup(
      request,
      admin,
      { id: orliki, isPublic: true, publicDescription: 'Pływanie dla dzieci.' },
      String(before.body?.updatedAt),
    )
    expect(made.status, JSON.stringify(made.body)).toBe(200)

    await createFee(request, admin, {
      name: 'Basen',
      groupId: orliki,
      period: 'monthly',
      amount: 12000,
      dueDay: 5,
      validFrom: today,
    })
    await createFee(request, admin, {
      name: 'Basen od przyszłego miesiąca',
      groupId: orliki,
      period: 'monthly',
      amount: 13300,
      dueDay: 5,
      validFrom: `${periodFromNow(1)}-01`,
    })
    await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15500,
      dueDay: 10,
      validFrom: today,
    })
    await createDiscountRule(request, admin, { name: 'Rodzeństwo 30%', kind: 'sibling', percent: 30, validFrom: today })

    await publish(request, admin, slug, ['description_schedule', 'prices'])

    // The block: Orliki's current fee with the sibling discount; no Żaki, no future fee, no fee or rule name.
    const shown = await sectionBlocks(request, slug)
    expect(shown.blocks.groups?.items.map((item) => item.id)).toEqual([orliki])
    expect(shown.blocks.prices).toEqual({
      groups: [
        {
          groupId: orliki,
          fees: [{ amount: 12000, currency: 'PLN', period: 'monthly', siblingDiscountPercent: 30 }],
        },
      ],
    })
    expect(shown.json).not.toContain(zaki)
    expect(shown.json).not.toContain('15500')
    expect(shown.json).not.toContain('13300')
    expect(shown.json).not.toContain('Rodzeństwo')

    // The browser: the fee line on the card, at 375 px, in both locales.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'pl')
    await page.goto(`/p/${slug}/sections/basen`)
    const fee = page.getByTestId(`public-group-${orliki}`).getByTestId('public-group-fee')
    await expect(fee).toContainText('Składka:')
    await expect(fee).toContainText('120 zł / miesiąc')
    await expect(fee).toContainText('rodzeństwo −30%')
    await expectNoPageOverflow(page)
    const violations = await scanBlockingViolations(page, testInfo, {})
    expect(violations).toEqual([])
    await setGuestLocale(page, 'en')
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(fee).toContainText('Membership fee:')
    await expect(fee).toContainText('/ month')
    await expect(fee).toContainText('siblings −30%')

    // "Prices" switched off (F-11): no price in the response, no fee line on the card.
    await publish(request, admin, slug, ['description_schedule'])
    const hidden = await sectionBlocks(request, slug)
    expect(hidden.blocks).not.toHaveProperty('prices')
    expect(hidden.blocks.groups?.items.map((item) => item.id)).toEqual([orliki])
    expect(hidden.json).not.toContain('12000')
    await page.goto(`/p/${slug}/sections/basen`)
    await expect(page.getByTestId(`public-group-${orliki}`)).toBeVisible()
    await expect(page.getByTestId('public-group-fee')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
