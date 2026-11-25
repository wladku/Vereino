import { expect, test } from '@playwright/test'
import { addDays, createActivity } from '../_fixtures/activities'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { call, calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiTextIn } from '../_fixtures/ui-text'

// Training outlines spec TEST-O07 (REQ-O09, AC-O08, M-O7, DD-O08; E24-S03, #683): the print page of a session's
// outline shows the PZPN layout — the header table (club, team, age category, date, place, coach, players, duration,
// topic, goal, specific goals, equipment) and the three part tables with the columns "Ćwiczenie / organizacja",
// "Czas", "Uwagi metodyczne" — with the labels in the outline's language (Polish here, whatever the reader's), the
// document titled with the PDF's file name, and in print media nothing but the sheet: no toolbar, no navigation. The
// browser prints it to a PDF.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const exercise = (name: string, minutes: number, organisation: string, coachingPoints: string) => ({
  name,
  minutes,
  organisation,
  coachingPoints,
})

test('TEST-O07 the print page shows the PZPN layout and nothing else in print media', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-o07')
  try {
    const family = await familyFor(request, club)
    const day = addDays(calendarDate(), 5)
    const activity = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      startsOn: day,
      startTime: '17:00',
      endTime: '18:15',
    })
    const session = (await sessionsOf(request, club, activity.id)).at(0)
    if (!session) throw new Error('[test] the training has no session')
    const created = await call<{ id: string }>(request, 'POST', '/api/training/outlines', family.coach.token, {
      data: {
        occurrenceId: session.id,
        language: 'pl',
        topic: 'Gra 1×1 w obronie',
        goal: 'Odbiór piłki w pojedynku',
        specificGoals: 'Ustawienie ciała, timing wślizgu',
        ageCategory: 'U11',
        durationMinutes: 75,
        playersCount: 12,
        equipment: 'Pachołki, 6 piłek, 4 małe bramki',
        parts: {
          warm_up: [exercise('Rondo 4×1', 15, 'Kwadrat 10×10 m', 'Szybkie podania')],
          main: [
            exercise('Gra 1×1 na małe bramki', 25, 'Pole 15×10 m', 'Bok do napastnika'),
            exercise('Gra 4×4', 25, 'Pole 30×20 m', 'Asekuracja'),
          ],
          cool_down: [exercise('Rozciąganie', 10, 'Koło', '')],
        },
      },
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const outlineId = String(created.body?.id)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    // The reader works in English; the Polish outline still prints with Polish labels.
    await page.goto('/club/training/outlines')
    await page.context().addCookies([{ name: 'locale', value: 'en', url: new URL(page.url()).origin }])
    await page.goto(`/club/training/outlines/${outlineId}/print`)
    const sheet = page.getByTestId('training-print-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('lang', 'pl')
    await expect(sheet.getByRole('heading', { level: 1 })).toHaveText(uiTextIn('pl', 'training.print.sheet.title'))
    const header = page.getByTestId('training-print-header')
    const rows = ['club', 'team', 'ageCategory', 'date', 'place', 'coach', 'players', 'duration', 'topic', 'goal']
    for (const key of [...rows, 'specificGoals', 'equipment']) {
      await expect(
        header.getByRole('rowheader', { name: uiTextIn('pl', `training.print.sheet.${key}`), exact: true }),
      ).toBeVisible()
    }
    await expect(header).toContainText('Żaki')
    await expect(header).toContainText('Marek Trener')
    await expect(header).toContainText('U11')
    await expect(header).toContainText('Gra 1×1 w obronie')
    for (const part of ['warm_up', 'main', 'cool_down']) {
      const table = page.getByTestId(`training-print-part-${part}`)
      await expect(table).toBeVisible()
      for (const column of ['exercise', 'time', 'coachingPoints']) {
        await expect(
          table.getByRole('columnheader', {
            name: uiTextIn('pl', `training.print.sheet.column.${column}`),
            exact: true,
          }),
        ).toBeVisible()
      }
    }
    await expect(page.getByTestId('training-print-part-main').getByRole('row')).toHaveCount(3)
    await expect(page.getByTestId('training-print-part-main')).toContainText('Bok do napastnika')
    // The document is titled with the PDF's file name (REQ-O09): the browser offers it when saving.
    await expect(page).toHaveTitle(`konspekt-${day}-gra-1-1-w-obronie`)

    // --- Print media: only the sheet is visible; the toolbar and any navigation are not ---
    await expect(page.getByTestId('training-print-toolbar')).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByTestId('training-print-toolbar')).toBeHidden()
    await expect(sheet).toBeVisible()
    const chrome = await page.evaluate(() =>
      [...document.querySelectorAll('nav, header, footer, aside, [role="navigation"]')]
        .filter((element) => !element.closest('[data-print-sheet]'))
        .filter(
          (element) =>
            getComputedStyle(element).visibility !== 'hidden' && (element as HTMLElement).offsetParent !== null,
        )
        .map((element) => element.tagName),
    )
    expect(chrome).toEqual([])
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    await testInfo.attach('outline.pdf', { body: pdf, contentType: 'application/pdf' })
  } finally {
    await club.cleanup()
  }
})
