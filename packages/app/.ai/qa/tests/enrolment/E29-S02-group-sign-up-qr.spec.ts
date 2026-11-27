import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call, createClub, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { applicationRows, createGroup, openApplications } from '../_fixtures/enrolment'
import { putSectionPublic } from '../_fixtures/publication'

// E29-S02 (#869; D41, D44, D29): a coach shows a group's QR code on the phone and downloads a printable poster; the
// code holds only the public address of the section's sign-up form with `?group={id}` — no token, nothing personal.
// A parent who opens it gets the form with that group chosen. A group that is not public, or a section whose sign-ups
// are closed, gives "sign-ups closed" instead of a form, and nothing is created. The route answers 404 for an unknown
// group (its cross-club probe is in the isolation inventory).
test.describe.configure({ timeout: 420_000 })

type SignUpCode = { status: 'open' | 'closed'; url?: string; groupName?: string; sectionName?: string }

const codeApi = (groupId: string): string => `/api/enrolment/groups/${groupId}/sign-up-code`

test('E29-S02 a coach shares the group sign-up QR code; a parent lands on the form with the group chosen', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e29-s02-group-qr')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `e29-${tag}`
    const sectionSlug = `akademia-${tag}`
    const hidden = await createGroup(request, admin, { sectionId: family.academy, name: 'Kadra', kind: 'class_group' })
    await openApplications(request, club, { clubSlug, sectionId: family.academy, sectionSlug, groupIds: [family.zaki] })

    // The API, as the coach of Żaki: the public address with the group; a hidden group is closed; unknown is 404.
    const open = await call<SignUpCode>(request, 'GET', codeApi(family.zaki), family.coach.token)
    expect(open.status, JSON.stringify(open.body)).toBe(200)
    expect(open.body).toMatchObject({ status: 'open', groupName: 'Żaki', sectionName: 'Akademia piłkarska' })
    const url = String(open.body?.url)
    expect(url).toMatch(
      new RegExp(`^https?://[^/]+/p/${clubSlug}/sections/${sectionSlug}/apply\\?group=${family.zaki}$`),
    )
    const closedGroup = await call<SignUpCode>(request, 'GET', codeApi(hidden), family.coach.token)
    expect(closedGroup.body).toEqual({ status: 'closed', groupName: 'Kadra' })
    const unknown = await call(request, 'GET', codeApi('00000000-0000-4000-8000-000000000000'), family.coach.token)
    expect(unknown.status).toBe(404)
    const notUuid = await call(request, 'GET', codeApi('not-a-group'), family.coach.token)
    expect(notUuid.status).toBe(404)
    const path = new URL(url).pathname + new URL(url).search

    // The coach on the phone: the group page offers the code; the sheet shows it at 240 px or more, the address and
    // the poster download, in en and pl.
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    for (const locale of ['en', 'pl'] as const) {
      await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3000' }])
      await page.goto(`/club/groups/${family.zaki}`)
      await page.getByTestId('group-sign-up-code-open').click()
      const dialog = page.getByTestId('group-sign-up-code-dialog')
      await expect(dialog.getByTestId('group-sign-up-code-qr')).toBeVisible()
      await expect(dialog.getByTestId('group-sign-up-code-url')).toHaveValue(url)
      const box = await dialog.getByTestId('group-sign-up-code-qr').boundingBox()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(240)
      await expectNoPageOverflow(page, 375)
      const downloading = page.waitForEvent('download')
      await dialog.getByTestId('group-sign-up-code-download').click()
      const download = await downloading
      expect(download.suggestedFilename()).toBe('sign-up-qr-code.svg')
      const poster = await readFile(await download.path(), 'utf8')
      expect(poster).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm"')
      expect(poster).toContain('Żaki')
      expect(poster).toContain(url.replaceAll('&', '&amp;'))
      expect(poster).not.toContain('@')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
    await prepareForAccessibilityScan(page)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/groups/[id] sign-up QR code',
      async () => {
        await page.getByTestId('group-sign-up-code-open').click()
        await expect(page.getByTestId('group-sign-up-code-qr')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await page.keyboard.press('Escape')

    // The parent scans the code: the section's form, and at step 2 Żaki is already chosen.
    await page.context().clearCookies()
    await page.goto(path)
    await expect(page.getByTestId('enrolment-apply-form')).toBeVisible()
    await page.getByTestId('enrolment-kind-child').click()
    await page.getByTestId('enrolment-participantFirstName').fill('Ola')
    await page.getByTestId('enrolment-participantLastName').fill('Nowak')
    const birth = new Date()
    birth.setUTCFullYear(birth.getUTCFullYear() - 8)
    await page.getByTestId('enrolment-participantBirthDate').fill(birth.toISOString().slice(0, 10))
    await page.getByTestId('enrolment-next').click()
    await expect(page.getByTestId('enrolment-step-2')).toBeVisible()
    await expect(page.locator(`input[name="groupId"][value="${family.zaki}"]`)).toBeChecked()

    // A hidden group's address: "sign-ups closed", no form.
    await page.goto(`/p/${clubSlug}/sections/${sectionSlug}/apply?group=${hidden}`)
    await expect(page.getByTestId('enrolment-closed')).toBeVisible()
    await expect(page.getByTestId('enrolment-apply-form')).toHaveCount(0)

    // The section closes its sign-ups: the printed code now gives "closed" and the API says so too.
    const closing = await putSectionPublic(request, admin, family.academy, { acceptsApplications: false })
    expect(closing.status, JSON.stringify(closing.body)).toBe(200)
    await page.goto(path)
    await expect(page.getByTestId('enrolment-closed')).toBeVisible()
    await expect(page.getByTestId('enrolment-apply-form')).toHaveCount(0)
    const afterClosing = await call<SignUpCode>(request, 'GET', codeApi(family.zaki), admin)
    expect(afterClosing.body).toEqual({ status: 'closed', groupName: 'Żaki' })
    expect(await applicationRows(club)).toEqual([])
  } finally {
    await club.cleanup()
  }
})
