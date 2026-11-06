import { expect, test } from '@playwright/test'
import { addDays, scheduleFor, type WeekdayCode } from '../_fixtures/activities'
import { oneOff } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, createClub, createPerson, mercato, uniqueSuffix } from '../_fixtures/club'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import {
  auditRows,
  expireLinks,
  linkApi,
  linkFacts,
  lockHeader,
  publicCall,
  requestLink,
  startSession,
  tokenFromEmail,
} from '../_fixtures/declaration-links'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { capturedTo, uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship, endGuardianship, getGuardianship } from '../_fixtures/people'
import { publish } from '../_fixtures/publication'

// Issue #105, club spec TEST-017 (REQ-017, AC-017; security) with foundation TEST-F07's consumer half (P-10, P-19): a
// guardian without an account asks for a personal link from the public session page; a registered address gets the
// e-mail, an unknown one gets the same 202 and nothing (no enumeration); the link lists only the guardian's children in
// the group (first names), declares for them with `source = link` — another family's child is 403, the session's kind
// still decides (422), a started session is closed (409, "Declarations closed"), an expired link 410, an unknown one
// 404 — and the raw token is stored nowhere (hash only, no audit payload). The evening job reminds the families of
// tomorrow's undeclared match once. In the browser: the link page declares, the public page leads to the request form,
// an expired link offers a new one.
test.describe.configure({ timeout: 600_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test('TEST-017 personal declaration links: neutral request, declaration for own children only, 403/410/404/closed, no raw token at rest, one reminder per family', async ({
  request,
  page,
}) => {
  const club = await createClub(request, 'test-017')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    const slug = `t017-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const since = addDays(calendarDate(), -30)

    // The Linkowski family: a guardian without an account and two children in Żaki; the Obcy family: another child.
    const guardianEmail = uniqueAddress('ewa')
    const otherEmail = uniqueAddress('olaf')
    const guardian = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Linkowska',
      birthDate: birthDateTurning(38),
      email: guardianEmail,
    })
    const zosia = await createPerson(request, admin, {
      firstName: 'Zosia',
      lastName: 'Linkowska',
      birthDate: birthDateTurning(9),
    })
    const tymek = await createPerson(request, admin, {
      firstName: 'Tymek',
      lastName: 'Linkowski',
      birthDate: birthDateTurning(10),
    })
    const otherGuardian = await createPerson(request, admin, {
      firstName: 'Olaf',
      lastName: 'Obcy',
      birthDate: birthDateTurning(40),
      email: otherEmail,
    })
    const otherChild = await createPerson(request, admin, {
      firstName: 'Fryderyk',
      lastName: 'Obcy',
      birthDate: birthDateTurning(9),
    })
    // A child whose guardianship with Ewa ended yesterday: the link no longer reaches them.
    const formerWard = await createPerson(request, admin, {
      firstName: 'Ignacy',
      lastName: 'Byly',
      birthDate: birthDateTurning(11),
    })
    const formerGuardianship = await createGuardianship(request, admin, {
      guardianPersonId: guardian,
      wardPersonId: formerWard,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: since,
    })
    const ended = await endGuardianship(
      request,
      admin,
      formerGuardianship,
      (await getGuardianship(request, admin, formerGuardianship)).body?.updatedAt,
      addDays(calendarDate(), -1),
    )
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    for (const [guardianId, wardId] of [
      [guardian, zosia],
      [guardian, tymek],
      [otherGuardian, otherChild],
    ]) {
      await createGuardianship(request, admin, {
        guardianPersonId: guardianId,
        wardPersonId: wardId,
        isPrimaryPayer: true,
        consents: { regulations: true },
        validFrom: since,
      })
    }
    for (const personId of [zosia, tymek, otherChild, formerWard]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }

    const session = async (name: string, type: string, weekday: WeekdayCode) =>
      oneOff(request, club, coordinator, {
        groupId: zaki,
        placeId: pitch,
        name,
        type,
        weekday,
        fromDaysAhead: 2,
        start: '10:00',
        end: '11:30',
      })
    const match = await session('Mecz z linkiem', 'match', 'SA')
    const training = await session('Trening z linkiem', 'training', 'TU')

    // A registered address (typed in capitals): 202 and the e-mail with the personal link.
    const known = await requestLink(guardianEmail.toUpperCase(), slug, match.session.id)
    expect(known.status, known.text).toBe(202)
    // An unknown address, and the right address under another club's slug: the same 202 and body, no e-mail.
    const unknownEmail = uniqueAddress('nobody')
    const unknown = await requestLink(unknownEmail, slug, match.session.id)
    expect(unknown.status).toBe(202)
    expect(unknown.body).toEqual(known.body)
    expect((await requestLink(guardianEmail, `no-such-${uniqueSuffix()}`, match.session.id)).body).toEqual(known.body)
    // A malformed body is the only other answer.
    expect((await requestLink('not-an-address', slug, match.session.id)).status).toBe(400)

    const [linkMail] = await awaitEmails(guardianEmail, 'Mecz z linkiem')
    expect(emailsTo(guardianEmail, 'Mecz z linkiem')).toHaveLength(1)
    expect(capturedTo([unknownEmail])).toHaveLength(0)
    const matchToken = tokenFromEmail(linkMail)
    expect(linkMail.text).not.toContain('Fryderyk')

    // The link: the session and the guardian's children in the group — first names only, nobody else.
    const read = await publicCall('GET', linkApi(matchToken))
    expect(read.status, read.text).toBe(200)
    expect(read.body?.session).toMatchObject({ activityName: 'Mecz z linkiem', kind: 'confirm', window: 'open' })
    const persons = read.body?.persons as Array<{ id: string; firstName: string; declared: string }>
    expect(persons.map((person) => person.id).sort()).toEqual([zosia, tymek].sort())
    expect(persons.map((person) => person.firstName).sort()).toEqual(['Tymek', 'Zosia'])
    expect(read.text).not.toContain('Fryderyk')
    expect(read.text).not.toContain('Ignacy')
    expect(read.text).not.toContain('Linkowsk')
    expect(read.text).not.toContain(guardianEmail)

    // Declaring for the guardian's child: saved as from the guardian, through the link.
    const declared = await publicCall('POST', linkApi(matchToken), { personId: zosia, declared: 'yes' })
    expect(declared.status, declared.text).toBe(201)
    expect(declared.body).toMatchObject({
      personId: zosia,
      occurrenceId: match.session.id,
      declared: 'yes',
      declarationStatus: 'final',
      declaredByPersonId: guardian,
      source: 'link',
      actingRole: 'guardian',
    })
    const changed = await publicCall('POST', linkApi(matchToken), { personId: zosia, declared: 'no' })
    expect(changed.status, changed.text).toBe(200)
    // The page reads the declaration's lock token and sends it back: a change made meanwhile (another guardian, the
    // ward) answers 409 `optimistic_lock_conflict` instead of being overwritten; the current token saves.
    const reread = await publicCall('GET', linkApi(matchToken))
    const zosiaRow = (reread.body?.persons as Array<{ id: string; declared: string; updatedAt: string | null }>).find(
      (person) => person.id === zosia,
    )
    expect(zosiaRow).toMatchObject({ declared: 'no', updatedAt: changed.body?.updatedAt })
    const stale = await publicCall(
      'POST',
      linkApi(matchToken),
      { personId: zosia, declared: 'yes' },
      lockHeader(String(declared.body?.updatedAt)),
    )
    expect(stale.status, stale.text).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')
    const current = await publicCall(
      'POST',
      linkApi(matchToken),
      { personId: zosia, declared: 'yes' },
      lockHeader(String(zosiaRow?.updatedAt)),
    )
    expect(current.status, current.text).toBe(200)

    // Another family's child and the child of an ended guardianship: 403, nothing written.
    for (const personId of [otherChild, formerWard]) {
      const foreign = await publicCall('POST', linkApi(matchToken), { personId, declared: 'no' })
      expect(foreign.status, foreign.text).toBe(403)
      expect(foreign.body?.code).toBe('scope_denied')
    }

    // The audit entries (encrypted at rest; the acting role they record is the response's `actingRole: guardian`): one per
    // saved declaration, without an actor user, an undo or a stored command payload — the input carries the raw token.
    const attendanceId = String(declared.body?.id)
    const stored = await auditRows(attendanceId)
    expect(stored).toHaveLength(3)
    expect(stored.every((row) => row.actor_user_id === null && !row.has_undo && !row.has_payload)).toBe(true)

    // The raw token is not stored: the row holds its hash.
    const facts = await linkFacts(guardian, match.session.id, matchToken)
    expect(facts.count).toBe(1)
    expect(facts.storesRaw).toBe(false)
    expect(facts.usedCounts[0]).toBeGreaterThanOrEqual(3)

    // A training (`absence_only`): "yes" is refused, an absence is saved.
    expect((await requestLink(guardianEmail, slug, training.session.id)).status).toBe(202)
    const trainingToken = tokenFromEmail((await awaitEmails(guardianEmail, 'Trening z linkiem'))[0])
    const trainingRead = await publicCall('GET', linkApi(trainingToken))
    expect(trainingRead.body?.session).toMatchObject({ kind: 'absence_only', window: 'open' })
    const yes = await publicCall('POST', linkApi(trainingToken), { personId: tymek, declared: 'yes' })
    expect(yes.status, yes.text).toBe(422)
    expect(yes.body?.code).toBe('declaration_kind_absence_only')
    expect((await publicCall('POST', linkApi(trainingToken), { personId: tymek, declared: 'no' })).status).toBe(201)

    // A started session: the page says "closed" and a declaration is 409.
    await startSession(training.session.id)
    const started = await publicCall('GET', linkApi(trainingToken))
    expect(started.status, started.text).toBe(200)
    expect(started.body?.session).toMatchObject({ window: 'closed' })
    const late = await publicCall('POST', linkApi(trainingToken), { personId: tymek, declared: 'unknown' })
    expect(late.status, late.text).toBe(409)
    expect(late.body?.code).toBe('declaration_closed')

    // An expired link: 410 on read and on write.
    expect(await expireLinks(guardian, training.session.id)).toBe(1)
    const expired = await publicCall('GET', linkApi(trainingToken))
    expect(expired.status, expired.text).toBe(410)
    expect(expired.body?.code).toBe('token_link_expired')
    expect((await publicCall('POST', linkApi(trainingToken), { personId: tymek, declared: 'no' })).status).toBe(410)

    // An unknown or malformed token: 404 without detail.
    for (const token of ['x', 'A'.repeat(43)]) {
      const missing = await publicCall('GET', linkApi(token))
      expect(missing.status, token).toBe(404)
      expect(missing.body?.code).toBe('declaration_link_not_found')
      expect(Object.keys(missing.body ?? {}).sort()).toEqual(['code', 'error'])
    }

    // The evening before the match: one reminder for each family with an undeclared child (the former ward, without a
    // guardian or an address, is skipped), none on a rerun.
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
    const eve = `${addDays(match.date, -1)}T11:00:00.000Z`
    const run = mercato(['activities', 'send-declaration-reminders', ...scope, '--now', eve]) as {
      processed?: number
      failed?: number
    }
    expect(run).toMatchObject({ processed: 2, failed: 0 })
    const [reminder] = await awaitEmails(guardianEmail, 'Tomorrow: Mecz z linkiem')
    await awaitEmails(otherEmail, 'Tomorrow: Mecz z linkiem')
    const reminderRead = await publicCall('GET', linkApi(tokenFromEmail(reminder)))
    expect(reminderRead.status).toBe(200)
    const rerun = mercato(['activities', 'send-declaration-reminders', ...scope, '--now', eve]) as {
      processed?: number
      failed?: number
    }
    expect(rerun).toMatchObject({ processed: 0, failed: 0 })
    expect(emailsTo(otherEmail, 'Tomorrow: Mecz z linkiem')).toHaveLength(1)

    // The browser, signed out: the link page declares; the public page leads to the request form.
    const guest = await page.context().browser()?.newContext()
    if (!guest) throw new Error('[internal] no browser')
    try {
      const guestPage = await guest.newPage()
      await guestPage.goto(new URL(`/club/d/${matchToken}`, BASE_URL).toString())
      await expect(guestPage.getByTestId('declaration-link-activity')).toHaveText('Mecz z linkiem')
      const tymekCard = guestPage.locator(`[data-testid="declaration-link-person"][data-person-id="${tymek}"]`)
      await tymekCard.getByTestId('declaration-action-no').click()
      await expect(tymekCard.getByTestId('declaration-link-saved')).toBeVisible()
      await expect(tymekCard.getByTestId('declaration-action-no')).toHaveAttribute('aria-pressed', 'true')
      await expect(guestPage.getByTestId('declaration-link-sign-in')).toBeVisible()
      await expect(guestPage.locator('body')).not.toContainText('Fryderyk')

      await guestPage.goto(new URL(`/club/d/${trainingToken}`, BASE_URL).toString())
      await expect(guestPage.getByTestId('token-page-expired')).toBeVisible()

      await guestPage.goto(new URL(`/p/${slug}/s/${match.session.id}`, BASE_URL).toString())
      await guestPage.getByTestId('public-session-request-link').click()
      await expect(guestPage).toHaveURL(/\/club\/link\?/)
      await expect(guestPage.getByTestId('link-request-session')).toContainText('Mecz z linkiem')
      await guestPage.getByTestId('link-request-email').fill(uniqueAddress('browser-nobody'))
      await guestPage.getByTestId('link-request-submit').click()
      await expect(guestPage.getByTestId('link-request-feedback')).toHaveAttribute('data-state', 'sent')
      await expect(guestPage.getByTestId('link-request-feedback')).toHaveText(
        /If the address is registered with the club|Jeśli adres jest zarejestrowany w klubie/,
      )
    } finally {
      await guest.close()
    }
  } finally {
    await club.cleanup()
  }
})
