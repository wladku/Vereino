import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  PUBLICATION_BLOCKS,
  getSettings,
  putSettings,
  type PublicationBlock,
  type Settings,
} from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Navigation spec TEST-N12 (REQ-N12, DD-N13; #262): online booking requests need the facility calendar. Turning
// requests on without the calendar answers 422 `publication_requests_need_calendar` on the field; a stored setting
// that already breaks the rule still saves untouched, because the rule runs only when either flag changes; turning
// the calendar off with requests on ends with both off (the form asks first and sends both).
test.describe.configure({ timeout: 300_000 })

type ErrorBody = { code?: string; fieldErrors?: Record<string, string> }

const blocksWith = (on: readonly PublicationBlock[]) =>
  Object.fromEntries(
    PUBLICATION_BLOCKS.map((block) => [block, on.includes(block)]),
  ) as Settings['publication']['blocks']

test('TEST-N12 online requests need the facility calendar, checked only when a flag changes', async ({
  request,
  page,
}) => {
  const club = await createClub(request, 'test-n12-publication')
  try {
    let token = club.adminToken
    const save = async (on: readonly PublicationBlock[]) => {
      const result = await putSettings(request, token, { publication: { blocks: blocksWith(on) } })
      return result as typeof result & { body: (Settings & ErrorBody) | null }
    }

    // The calendar off: turning requests on is refused on the field and changes nothing.
    const refused = await save(['contact', 'online_requests'])
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body).toMatchObject({ code: 'publication_requests_need_calendar' })
    expect(refused.body?.fieldErrors?.online_requests).toBeTruthy()
    expect((await getSettings(request, token)).publication.blocks.online_requests).toBe(false)

    // Both on is accepted; turning the calendar off while requests stay on is refused as well.
    expect((await save(['places_calendar', 'online_requests'])).status).toBe(200)
    const calendarOff = await save(['online_requests'])
    expect(calendarOff.status, JSON.stringify(calendarOff.body)).toBe(422)
    expect(calendarOff.body).toMatchObject({ code: 'publication_requests_need_calendar' })

    // A stored setting that already breaks the rule (saved before it existed) loads and saves untouched.
    // Written straight to the row, as no API path accepts it any more.
    await withClient(async (client) => {
      await client.query(
        'update club_core_club_settings set publication = $1::jsonb, updated_at = now() where organization_id = $2',
        [JSON.stringify({ enabled: false, blocks: blocksWith(['online_requests']) }), club.tenant.organizationId],
      )
    })
    const stored = await getSettings(request, token)
    expect(stored.publication.blocks).toMatchObject({ online_requests: true, places_calendar: false })
    const untouched = await save(['online_requests', 'contact'])
    expect(untouched.status, JSON.stringify(untouched.body)).toBe(200)
    expect(untouched.body?.publication.blocks).toMatchObject({ online_requests: true, contact: true })

    // The form: the administrator turns the calendar off with requests on, confirms, and both end off.
    expect((await save(['places_calendar', 'online_requests'])).status).toBe(200)
    // `signInBrowser` ends the administrator's API tokens: take a fresh one (lesson sign-in-browser-ends-the-api-token).
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    token = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = token
    const checkbox = (block: PublicationBlock) =>
      page
        .locator('form')
        .locator(
          `[data-crud-field-id="block_${block}"] button[role="checkbox"], [data-crud-field-id="block_${block}"] input[type="checkbox"]`,
        )
        .first()
    const saveButton = page.getByRole('button', { name: uiText('club_core.publication.save') }).first()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    const needCalendar = page.getByText(uiText('club_core.errors.publication_requests_need_calendar')).first()

    // Cancelling the confirmation (Escape) saves nothing and says why.
    await page.goto('/backend/club/publication')
    await checkbox('places_calendar').click()
    await saveButton.click()
    await expect(dialog.getByText(uiText('club_core.publication.confirm.calendarOffText'))).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(needCalendar).toBeVisible()
    expect((await getSettings(request, token)).publication.blocks).toMatchObject({
      places_calendar: true,
      online_requests: true,
    })

    // Confirming turns both off in one save.
    await page.goto('/backend/club/publication')
    await checkbox('places_calendar').click()
    await saveButton.click()
    await expect(dialog.getByText(uiText('club_core.publication.confirm.calendarOffText'))).toBeVisible()
    await dialog
      .getByRole('button', { name: uiText('club_core.publication.confirm.calendarOffConfirm', { exact: true }) })
      .click()
    await expect
      .poll(async () => (await getSettings(request, token)).publication.blocks)
      .toMatchObject({ places_calendar: false, online_requests: false })

    // The form refuses requests on without the calendar before it calls the API.
    await page.goto('/backend/club/publication')
    await checkbox('online_requests').click()
    await saveButton.click()
    await expect(needCalendar).toBeVisible()
    expect((await getSettings(request, token)).publication.blocks.online_requests).toBe(false)
  } finally {
    await club.cleanup()
  }
})
