import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { birthDateTurning, createAccount, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'

// TEST-F10 (foundation spec), integration part for phase A1: the account invitation renders with the platform
// dictionaries in pl and en. Known deviation from AC-F04/AC-F11: `auth.users.create` takes no locale, so the
// invitation follows the request locale (cookie `locale`, then `Accept-Language`), not the person's
// `preferred_locale`; `renderLocalized` / `localeForPerson` (person → club default → en) get their first e-mail
// consumer with the reminder e-mails of a later phase.
test.describe.configure({ timeout: 300_000 })

const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

function subjectFor(email: string): string | null {
  if (!fs.existsSync(capturePath)) return null
  const entries = fs
    .readFileSync(capturePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as { to: string; subject: string })
    .filter((entry) => entry.to === email)
  return entries.at(-1)?.subject ?? null
}

test('TEST-F10 the invitation is rendered in pl and in en (request locale)', async ({ request }) => {
  const club = await createClub(request, 'test-f10')
  try {
    const polishId = await createPerson(request, club.adminToken, {
      firstName: 'Zofia',
      lastName: 'Polska',
      birthDate: birthDateTurning(30),
      preferredLocale: 'pl',
    })
    const polishEmail = `zofia-${uniqueSuffix()}@example.org`
    const polish = await createAccount(request, club.adminToken, polishId, polishEmail, { Cookie: 'locale=pl' })
    expect(polish.status, JSON.stringify(polish.body)).toBe(201)
    club.extraUserIds.push(String(polish.body?.userId))

    const englishId = await createPerson(request, club.adminToken, {
      firstName: 'John',
      lastName: 'English',
      birthDate: birthDateTurning(30),
      preferredLocale: 'en',
    })
    const englishEmail = `john-${uniqueSuffix()}@example.org`
    const english = await createAccount(request, club.adminToken, englishId, englishEmail, {
      Cookie: 'locale=en',
      'Accept-Language': 'en-US',
    })
    expect(english.status, JSON.stringify(english.body)).toBe(201)
    club.extraUserIds.push(String(english.body?.userId))

    await expect.poll(() => subjectFor(polishEmail)).toBe('Zaproszenie do systemu')
    await expect.poll(() => subjectFor(englishEmail)).toBe('You have been invited')
  } finally {
    await club.cleanup()
  }
})
