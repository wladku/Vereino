import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { birthDateTurning, call, createAccount, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-F10 (foundation spec): the account invitation renders with the dictionaries in pl and en. The first
// invitation follows the request locale (cookie `locale`, then `Accept-Language`): `auth.users.create` takes no
// locale, an accepted deviation from AC-F11 (owner decision on #584, 2026-11-24). The invitation sent again
// (`people.persons.resend_invitation`) follows the person — `localeForPerson`: preferred locale, club default, `en` —
// so each person is resent with a request in the other language and still gets their own.
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

function resend(request: APIRequestContext, token: string, personId: string, headers: Record<string, string>) {
  return call<{ sentAt?: string; warning?: string }>(
    request,
    'POST',
    `/api/people/persons/${personId}/account/invitation`,
    token,
    { data: {}, headers },
  )
}

test('TEST-F10 the invitation renders in the request locale, the resend in the person locale', async ({ request }) => {
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

    // The resend follows the person, not the administrator's request in the other language.
    const polishResent = await resend(request, club.adminToken, polishId, {
      Cookie: 'locale=en',
      'Accept-Language': 'en-US',
    })
    expect(polishResent.status, JSON.stringify(polishResent.body)).toBe(200)
    expect(polishResent.body?.warning).toBeUndefined()
    const englishResent = await resend(request, club.adminToken, englishId, {
      Cookie: 'locale=pl',
      'Accept-Language': 'pl-PL',
    })
    expect(englishResent.status, JSON.stringify(englishResent.body)).toBe(200)
    expect(englishResent.body?.warning).toBeUndefined()

    await expect.poll(() => subjectFor(polishEmail)).toBe(uiTextIn('pl', 'foundation.account.invitation.subject'))
    await expect.poll(() => subjectFor(englishEmail)).toBe(uiTextIn('en', 'foundation.account.invitation.subject'))
  } finally {
    await club.cleanup()
  }
})
