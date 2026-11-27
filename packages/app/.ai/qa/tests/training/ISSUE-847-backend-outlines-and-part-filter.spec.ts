import { expect, test, type Page } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { getAuthToken } from '../_fixtures/auth'
import { call, createClub } from '../_fixtures/club'
import { signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// Issue #847 (training outlines spec *UI architecture* and M-O5, owner decision 2026-11-26): the outline list's part
// filter and the administrator's back-office outline pages. The coach of Żaki has two outlines: one with exercises in
// every part, one with a main part only. The list route keeps the outlines with exercises in the asked part (and
// refuses an unknown part); the member list filters by part on a 375 px phone; the administrator lists the club's
// outlines on `/backend/training/outlines` (`DataTable`, part filter), changes one's header in the `CrudForm` of
// `/backend/training/outlines/[id]` and deletes the other there.
test.describe.configure({ timeout: 300_000 })

type Listed = { items?: { id: string; topic: string }[] }

const exercise = (name: string, minutes: number) => ({ name, minutes })

const content = (
  topic: string,
  parts: Record<'warm_up' | 'main' | 'cool_down', { name: string; minutes: number }[]>,
) => ({
  language: 'pl',
  topic,
  goal: 'Prowadzenie piłki',
  ageCategory: 'U11',
  durationMinutes: 60,
  parts,
})

async function chooseFilterOption(page: Page, labelKey: string, optionKey: string) {
  await page
    .getByRole('button', { name: uiText('ui.filterBar.filters') })
    .first()
    .click()
  // The overlay is an inline panel; each filter is a block with its label and a select.
  await page
    .locator('div.space-y-2')
    .filter({ has: page.getByText(uiText(labelKey, { exact: true })) })
    .filter({ has: page.getByRole('combobox') })
    .last()
    .getByRole('combobox')
    .first()
    .click()
  await page.getByRole('option', { name: uiText(optionKey, { exact: true }) }).click()
  await page
    .getByRole('button', { name: uiText('ui.filters.actions.apply', { exact: true }) })
    .first()
    .click()
}

test('ISSUE-847 the outline list filters by part, and the administrator lists, edits and deletes outlines in the back office', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-847')
  try {
    const family = await familyFor(request, club)
    const coach = family.coach.token
    const full = await call<{ id: string }>(request, 'POST', '/api/training/outlines', coach, {
      data: content('Rondo i strzały', {
        warm_up: [exercise('Berek z piłką', 10)],
        main: [exercise('Strzały z dystansu', 30)],
        cool_down: [exercise('Rozciąganie', 5)],
      }),
    })
    expect(full.status, JSON.stringify(full.body)).toBe(201)
    const mainOnly = await call<{ id: string }>(request, 'POST', '/api/training/outlines', coach, {
      data: content('Gra 4×4', { warm_up: [], main: [exercise('Gra 4×4 na małe bramki', 40)], cool_down: [] }),
    })
    expect(mainOnly.status, JSON.stringify(mainOnly.body)).toBe(201)
    const fullId = String(full.body?.id)
    const mainOnlyId = String(mainOnly.body?.id)

    // --- The list route's part filter ---
    const byPart = async (part: string) => {
      const result = await call<Listed>(request, 'GET', `/api/training/outlines?part=${part}&sortField=topic`, coach)
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      return (result.body?.items ?? []).map((item) => item.id)
    }
    expect(await byPart('warm_up')).toEqual([fullId])
    expect(await byPart('cool_down')).toEqual([fullId])
    expect((await byPart('main')).sort()).toEqual([fullId, mainOnlyId].sort())
    const unknown = await call(request, 'GET', '/api/training/outlines?part=stretching', coach)
    expect(unknown.status).toBe(400)
    // Another coach's grants still narrow the filtered list: the pool group's instructor sees neither outline.
    const other = await call<Listed>(request, 'GET', '/api/training/outlines?part=main', family.instructor.token)
    expect(other.status).toBe(200)
    expect(other.body?.items ?? []).toEqual([])

    // --- The member list on the phone: the part select ---
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club/training/outlines')
    const cards = page.getByTestId('training-outline-card')
    await expect(cards).toHaveCount(2)
    await page.getByTestId('training-outlines-part').selectOption('warm_up')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('Rondo i strzały')
    await page.getByTestId('training-outlines-part').selectOption('main')
    await expect(cards).toHaveCount(2)
    await page.getByTestId('training-outlines-search').fill('4×4')
    await expect(cards).toHaveCount(1)
    await page.getByTestId('training-outlines-search').fill('nic takiego')
    await expect(page.getByTestId('training-outlines-empty')).toHaveText(
      uiText('training.list.emptyFiltered', { exact: true }),
    )
    await signOutBrowser(page)

    // --- The administrator's back office ---
    await page.setViewportSize({ width: 1280, height: 900 })
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // The browser sign-in ended the earlier API tokens (lesson `sign-in-browser-ends-the-api-token`).
    const admin = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend/training/outlines')
    const table = page.getByTestId('training-backend-outlines')
    await expect(table.getByRole('heading', { name: uiText('training.list.title', { exact: true }) })).toBeVisible()
    const rows = table.locator('tbody tr')
    await expect(rows.filter({ hasText: 'Rondo i strzały' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Gra 4×4' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Gra 4×4' })).toContainText('U11')

    // The part filter: only the outline with a warm-up.
    await chooseFilterOption(page, 'training.library.part', 'training.outline.parts.warm_up')
    await expect(rows.filter({ hasText: 'Gra 4×4' })).toHaveCount(0)
    await expect(rows.filter({ hasText: 'Rondo i strzały' })).toHaveCount(1)

    // Open the outline: the header in the form, the parts below it with a link to the member editor.
    await rows.filter({ hasText: 'Rondo i strzały' }).first().click()
    await expect(page).toHaveURL(new RegExp(`/backend/training/outlines/${fullId}$`))
    const parts = page.getByTestId('training-backend-outline-parts')
    await expect(parts.getByTestId('training-outline-exercise')).toHaveCount(3)
    await expect(parts.getByText('Strzały z dystansu')).toBeVisible()
    await expect(parts.getByTestId('training-backend-outline-exercises')).toHaveAttribute(
      'href',
      `/club/training/outlines/${fullId}`,
    )
    const topic = page.locator('[data-crud-field-id="topic"] input')
    await expect(topic).toHaveValue('Rondo i strzały')
    // A duration outside 10–240 is refused on its field before the request.
    const duration = page.locator('[data-crud-field-id="durationMinutes"] input')
    await duration.fill('5')
    await page
      .getByRole('button', { name: uiText('training.editor.save', { exact: true }) })
      .first()
      .click()
    await expect(page.getByText(uiText('training.editor.problems.duration', { exact: true })).first()).toBeVisible()
    await duration.fill('75')
    await topic.fill('Rondo, strzały i rozciąganie')
    await page
      .getByRole('button', { name: uiText('training.editor.save', { exact: true }) })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/training\/outlines$/)
    const saved = await call<{ topic: string; durationMinutes: number; parts: { main: unknown[] } }>(
      request,
      'GET',
      `/api/training/outlines/${fullId}`,
      admin,
    )
    expect(saved.status).toBe(200)
    expect(saved.body?.topic).toBe('Rondo, strzały i rozciąganie')
    expect(saved.body?.durationMinutes).toBe(75)
    // The header save keeps the exercises.
    expect(saved.body?.parts.main).toHaveLength(1)
    await expect(rows.filter({ hasText: 'Rondo, strzały i rozciąganie' })).toHaveCount(1)

    // Delete the other outline from its form.
    await page.goto(`/backend/training/outlines/${mainOnlyId}`)
    await expect(page.locator('[data-crud-field-id="topic"] input')).toHaveValue('Gra 4×4')
    await page
      .getByRole('button', { name: uiText('ui.forms.actions.delete', { exact: true }) })
      .first()
      .click()
    await page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .getByRole('button', { name: uiText('ui.dialogs.confirm.confirmText', { exact: true }) })
      .click()
    await expect(page).toHaveURL(/\/backend\/training\/outlines(\?.*)?$/)
    const left = await call<Listed>(request, 'GET', '/api/training/outlines', admin)
    expect((left.body?.items ?? []).map((item) => item.id)).toEqual([fullId])

    // An unknown outline shows the not-found state.
    await page.goto('/backend/training/outlines/00000000-0000-4000-8000-000000000000')
    await expect(page.getByText(uiText('training.editor.notFound', { exact: true }))).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
