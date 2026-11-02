import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { birthDateTurning, createAccount, createClub, createPerson } from '../../_fixtures/club'
import { updateClubSettings } from '../../_fixtures/members'
import {
  capturedTo,
  outputOf,
  runProbe,
  uniqueAddress,
  type ProbeDelivery,
  type ProbeError,
} from '../../_fixtures/messaging'

// TEST-M04 (foundation III REQ-M04, AC-M04): recipients with `pl`, `en` and no preference (club default `pl`) get the
// probe `never` template in their language inside `EmailLayout`, the club's text verbatim and escaped; an operator
// override that enables e-mail on the probe's in-app type sends no e-mail through the platform's notification channel;
// in-app notifications carry keys only; a `preferences` template is refused (Q15 = B).
test.describe.configure({ timeout: 600_000 })

const CLUB_NAME = 'KS Próba'
const CLUB_TEXT = 'Mecz o <b>11:00</b>.\nZbiórka 10:15.\n\nDo zobaczenia!'

test('TEST-M04 templates: per-recipient language, escaped club text, no platform e-mail, preferences refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m04')
  try {
    const admin = club.adminToken
    const settings = await updateClubSettings(request, admin, { defaultLocale: 'pl', shortName: CLUB_NAME })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)

    const withAccount = async (firstName: string, preferredLocale: string) => {
      const personId = await createPerson(request, admin, {
        firstName,
        lastName: 'Odbiorca',
        preferredLocale,
        birthDate: birthDateTurning(35),
      })
      const email = uniqueAddress(`m04-${firstName.toLowerCase()}`)
      const account = await createAccount(request, admin, personId, email)
      expect(account.status, JSON.stringify(account.body)).toBe(201)
      const userId = String(account.body?.userId)
      club.extraUserIds.push(userId)
      // The invitation is captured first, so it is never mistaken for the dispatch's e-mail.
      await expect.poll(() => capturedTo([email]).length, { timeout: 20_000 }).toBeGreaterThan(0)
      return { personId, email, userId }
    }
    const ola = await withAccount('Ola', 'pl')
    const john = await withAccount('John', 'en')
    const noPreference = { email: uniqueAddress('m04-nopref'), personId: '' }
    noPreference.personId = await createPerson(request, admin, {
      firstName: 'Zenon',
      lastName: 'Domyślny',
      email: noPreference.email,
    })

    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const persons = { kind: 'persons', ids: [ola.personId, john.personId, noPreference.personId] }
    // The account invitations are already in the capture; only what follows is the dispatch's.
    const addresses = [ola.email, john.email, noPreference.email]
    const capturedBefore = capturedTo(addresses).length
    const run = runProbe(scope, [
      { op: 'override', typeId: 'qa_probe.message', channels: ['in_app', 'email'] },
      {
        op: 'enqueue',
        template: 'qa_probe.message',
        params: { subject: 'Trening', body: CLUB_TEXT },
        audience: persons,
        authorUserId: club.adminUserId,
        sourceId: randomUUID(),
        idempotencyKey: `test-m04:${ola.personId}`,
        as: 'message',
      },
      { op: 'drain' },
      { op: 'deliveries', dispatch: 'message' },
      { op: 'notifications', dispatch: 'message' },
      {
        op: 'enqueue',
        template: 'qa_probe.reminder',
        params: { subject: 'Przypomnienie', body: 'Tekst' },
        audience: persons,
        authorUserId: club.adminUserId,
        sourceId: randomUUID(),
        idempotencyKey: `test-m04:reminder:${ola.personId}`,
      },
    ])
    expect(run.result.failure).toBeNull()

    // The `never` template reached everyone, each in their language.
    const deliveries = (outputOf(run, 3) as { items: ProbeDelivery[] }).items
    expect(deliveries.filter((row) => row.channel === 'email').map((row) => row.status)).toEqual([
      'sent',
      'sent',
      'sent',
    ])
    const sendTo = (email: string) => run.result.sends.find((send) => send.to === email)
    expect(sendTo(ola.email)?.subject).toBe('Próba: Trening')
    expect(sendTo(john.email)?.subject).toBe('Probe: Trening')
    expect(sendTo(noPreference.email)?.subject).toBe('Próba: Trening')

    // Inside `EmailLayout`: the club's name, the chrome in the recipient's language, the club text escaped with its
    // line breaks, the button to the app.
    const polish = String(sendTo(ola.email)?.html)
    expect(polish).toContain('lang="pl"')
    expect(polish).toContain(`data-email-part="club">${CLUB_NAME}</p>`)
    expect(polish).toContain(`Otrzymujesz tę wiadomość, ponieważ ${CLUB_NAME} napisał do Ciebie.`)
    expect(polish).toContain(`Tę wiadomość wysłał ${CLUB_NAME} za pośrednictwem Vereino.`)
    expect(polish).toContain('Mecz o &lt;b&gt;11:00&lt;/b&gt;.<br/>Zbiórka 10:15.')
    expect(polish).toContain('Do zobaczenia!')
    expect(polish).not.toContain('<b>11:00</b>')
    expect(polish).toMatch(/href="https?:\/\/[^"]+\/club"[^>]*data-email-part="action">Otwórz w Vereino<\/a>/)
    const english = String(sendTo(john.email)?.html)
    expect(english).toContain('lang="en"')
    expect(english).toContain(`You receive this e-mail because ${CLUB_NAME} wrote to you.`)
    expect(english).toContain('Open in Vereino')
    expect(english).toContain('Mecz o &lt;b&gt;11:00&lt;/b&gt;.')
    expect(String(sendTo(noPreference.email)?.html)).toContain('Otrzymujesz tę wiadomość')

    // The capture (what the platform's `sendEmail` received) in two languages, club text verbatim.
    const dispatched = capturedTo(addresses).slice(capturedBefore)
    const polishMail = dispatched.find((mail) => mail.to === ola.email)
    expect(polishMail?.subject).toBe('Próba: Trening')
    expect(polishMail?.text).toContain('Mecz o <b>11:00</b>.')
    expect(polishMail?.text).toContain(CLUB_NAME)
    expect(polishMail?.text).toContain('Otrzymujesz tę wiadomość')
    const englishMail = dispatched.find((mail) => mail.to === john.email)
    expect(englishMail?.text).toContain('You receive this e-mail because')

    // No e-mail from the platform's notification channel despite the override: one e-mail per recipient, all ours.
    expect(dispatched).toHaveLength(3)
    for (const mail of dispatched) expect(mail.subject).toMatch(/^(Próba|Probe): Trening$/)

    // In-app notifications: the two account holders, in the app only, keys and no subject or text.
    const notifications = (outputOf(run, 4) as { items: Array<Record<string, unknown>> }).items
    expect(notifications.map((row) => row.recipient_user_id).sort()).toEqual([ola.userId, john.userId].sort())
    for (const row of notifications) {
      expect(row.channels).toEqual(['in_app'])
      expect(row.title_key).toBe('qa_probe.notifications.message.title')
      expect(JSON.stringify(row)).not.toContain('Trening')
      expect(JSON.stringify(row)).not.toContain('Mecz')
    }

    // A `preferences` template is refused until its opt-out exists.
    const refused = (outputOf(run, 5) as { error?: ProbeError }).error
    expect(refused).toMatchObject({ status: 500, fingerprint: 'foundation.dispatch.optout_unavailable' })
  } finally {
    await club.cleanup()
  }
})
