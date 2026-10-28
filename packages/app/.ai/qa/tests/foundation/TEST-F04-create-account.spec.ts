import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  birthDateTurning,
  call,
  createAccount,
  createClub,
  createPerson,
  getPerson,
  uniqueSuffix,
} from '../_fixtures/club'

// TEST-F04 (foundation spec; club spec *Account*): `people.persons.create_account` — 422 below the club's age
// threshold, 201 with the invitation, 409 for a second account, a failed invitation e-mail surfaced as
// `invite_email_failed` with a working resend, and `people_persons.user_id` written by the people command.
test.describe.configure({ timeout: 300_000 })

// In test mode the platform writes every e-mail to this file instead of sending it (`sendEmail` capture).
const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

type CapturedEmail = { to: string; subject: string; links: string[] }

function capturedFor(email: string): CapturedEmail[] {
  if (!fs.existsSync(capturePath)) return []
  return fs
    .readFileSync(capturePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as CapturedEmail)
    .filter((entry) => entry.to === email)
}

test('TEST-F04 create_account: age threshold, invitation, second account, failed e-mail and resend', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f04')
  try {
    // 15 years old, below the default own_account_min_age (16).
    const minorId = await createPerson(request, club.adminToken, {
      firstName: 'Kuba',
      lastName: 'Młody',
      birthDate: birthDateTurning(15),
    })
    const minor = await createAccount(request, club.adminToken, minorId, `kuba-${uniqueSuffix()}@example.org`)
    expect(minor.status).toBe(422)
    expect(minor.body?.code).toBe('account_age_below_threshold')

    // No birth date: the policy cannot be applied.
    const unknownAgeId = await createPerson(request, club.adminToken, { firstName: 'Nina', lastName: 'Bezdaty' })
    const unknownAge = await createAccount(request, club.adminToken, unknownAgeId, `nina-${uniqueSuffix()}@example.org`)
    expect(unknownAge.status).toBe(422)
    expect(unknownAge.body?.code).toBe('account_birth_date_required')

    // 40 years old: 201, the invitation is sent, the person is linked.
    const adultId = await createPerson(request, club.adminToken, {
      firstName: 'Ewa',
      lastName: 'Dorosła',
      birthDate: birthDateTurning(40),
    })
    const adultEmail = `ewa-${uniqueSuffix()}@example.org`
    const created = await createAccount(request, club.adminToken, adultId, adultEmail)
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body?.warning).toBeUndefined()
    const userId = String(created.body?.userId)
    club.extraUserIds.push(userId)
    expect((await getPerson(request, club.adminToken, adultId)).body?.userId).toBe(userId)
    await expect.poll(() => capturedFor(adultEmail).length).toBeGreaterThan(0)
    expect(capturedFor(adultEmail)[0]?.links.some((link) => link.includes('/reset/'))).toBe(true)

    // A second account for the same person → 409.
    const second = await createAccount(request, club.adminToken, adultId, `ewa-2-${uniqueSuffix()}@example.org`)
    expect(second.status).toBe(409)
    expect(second.body?.code).toBe('account_exists')

    // An e-mail already used by another user of the tenant → 409 email_taken.
    const twinId = await createPerson(request, club.adminToken, {
      firstName: 'Ewa',
      lastName: 'Bliźniaczka',
      birthDate: birthDateTurning(40),
    })
    const taken = await createAccount(request, club.adminToken, twinId, adultEmail)
    expect(taken.status).toBe(409)
    expect(taken.body?.code).toBe('email_taken')

    // The invitation transport fails (the capture file is read-only): the account exists, the warning is surfaced.
    const failingId = await createPerson(request, club.adminToken, {
      firstName: 'Fryderyk',
      lastName: 'Bezmaila',
      birthDate: birthDateTurning(30),
    })
    const failingEmail = `fryderyk-${uniqueSuffix()}@example.org`
    if (!fs.existsSync(capturePath)) fs.writeFileSync(capturePath, '')
    fs.chmodSync(capturePath, 0o444)
    let failed: Awaited<ReturnType<typeof createAccount>>
    try {
      failed = await createAccount(request, club.adminToken, failingId, failingEmail)
    } finally {
      fs.chmodSync(capturePath, 0o644)
    }
    expect(failed.status, JSON.stringify(failed.body)).toBe(201)
    expect(failed.body?.warning).toBe('invite_email_failed')
    const failedUserId = String(failed.body?.userId)
    club.extraUserIds.push(failedUserId)
    expect((await getPerson(request, club.adminToken, failingId)).body?.userId).toBe(failedUserId)
    expect(capturedFor(failingEmail)).toEqual([])

    // Resend through the platform route (needs `auth.users.create`, which the club roles do not carry).
    const resent = await call(request, 'POST', '/api/auth/users/resend-invite', club.superToken, {
      data: { id: failedUserId },
    })
    expect(resent.status, JSON.stringify(resent.body)).toBe(200)
    await expect.poll(() => capturedFor(failingEmail).length).toBeGreaterThan(0)
  } finally {
    if (fs.existsSync(capturePath)) fs.chmodSync(capturePath, 0o644)
    await club.cleanup()
  }
})
