import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { birthDateTurning, createClub, createPerson, uniqueSuffix, type Club } from '../_fixtures/club'
import { postThread } from '../_fixtures/communication'
import { updateClubSettings } from '../_fixtures/members'
import { capturedTo, outputOf, runProbe, uniqueAddress } from '../_fixtures/messaging'
import { publish } from '../_fixtures/publication'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-M04 (many clubs spec phase 3, REQ-M03, AC-M03; E22-S05 #631): with `VEREINO_CLUB_DOMAIN` set, a club's e-mail
// links to its own address and its sender's display name is the club's name in front of the instance's one address
// (Q-M03); each of two clubs gets its own address. The share link of a thread points there too. Without the variable
// the links stay on `APP_URL`. The dispatch runs in the messaging probe's process, which sets the variable for itself,
// so the shared test app keeps its one-club behaviour. Platform-sent mail (invitations, password reset) stays on
// `APP_URL` in this phase (owner's decision of 2026-11-23, option (c)).
test.describe.configure({ timeout: 600_000 })

const DOMAIN = 'vereino.test'
const INSTANCE_ADDRESS = 'no-reply@vereino.test'

type Mailbox = { club: Club; slug: string; name: string; personId: string; email: string }

async function clubWithRecipient(request: Parameters<typeof createClub>[0], label: string): Promise<Mailbox> {
  const club = await createClub(request, label)
  const slug = `qa-${label}-${uniqueSuffix()}`
  const name = `KS ${label.toUpperCase()} "Orzeł"`
  await publish(request, club.adminToken, slug, [])
  const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'en', shortName: name })
  expect(settings.status, JSON.stringify(settings.body)).toBe(200)
  const email = uniqueAddress(label)
  const personId = await createPerson(request, club.adminToken, {
    firstName: 'Ola',
    lastName: 'Odbiorca',
    email,
    birthDate: birthDateTurning(35),
  })
  return { club, slug, name, personId, email }
}

function sendMessage(box: Mailbox, clubDomain: string | null, key: string) {
  return runProbe({ tenantId: box.club.tenant.tenantId, organizationId: box.club.tenant.organizationId }, [
    { op: 'env', vars: { VEREINO_CLUB_DOMAIN: clubDomain } },
    {
      op: 'enqueue',
      template: 'qa_probe.message',
      params: { subject: `Link ${key}`, body: 'Szczegóły w aplikacji.' },
      audience: { kind: 'persons', ids: [box.personId] },
      authorUserId: box.club.adminUserId,
      sourceId: randomUUID(),
      idempotencyKey: `test-m04-club:${key}:${box.personId}`,
    },
    { op: 'drain' },
  ])
}

test('TEST-M04 e-mail links use each club’s address and the club’s name as the sender', async ({ request }) => {
  const a = await clubWithRecipient(request, 'm04a')
  const b = await clubWithRecipient(request, 'm04b')
  try {
    const appUrl = String(process.env.APP_URL).replace(/\/+$/, '')
    const scheme = new URL(appUrl).protocol
    for (const box of [a, b]) {
      const run = sendMessage(box, DOMAIN, 'domain')
      expect(run.result.failure, run.log.slice(-2000)).toBeNull()
      const mail = capturedTo([box.email]).find((entry) => entry.subject.endsWith('Link domain'))
      expect(mail, JSON.stringify(capturedTo([box.email]))).toBeDefined()
      expect(mail?.links).toContain(`${scheme}//${box.slug}.${DOMAIN}/club`)
      expect(mail?.links.some((link) => link.startsWith(appUrl))).toBe(false)
      const displayName = uiTextIn('en', 'foundation.email.senderName').replace('{club}', box.name)
      expect(mail?.from).toBe(`"${displayName.replace(/"/g, '\\"')}" <${INSTANCE_ADDRESS}>`)
    }

    // Without the club domain the same e-mail links from APP_URL, still with the club's name as the sender.
    const run = sendMessage(a, null, 'app')
    expect(run.result.failure, run.log.slice(-2000)).toBeNull()
    const plain = capturedTo([a.email]).find((entry) => entry.subject.endsWith('Link app'))
    expect(plain?.links).toContain(`${appUrl}/club`)

    // The share link of a thread is at the club's address too.
    const posted = await postThread(request, a.club.adminToken, {
      audience: { kind: 'club' },
      subject: 'Udostępnij',
      body: 'Treść',
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const share = runProbe({ tenantId: a.club.tenant.tenantId, organizationId: a.club.tenant.organizationId }, [
      { op: 'env', vars: { VEREINO_CLUB_DOMAIN: DOMAIN } },
      {
        op: 'routeGet',
        source: 'modules/communication/api/share-text/route.ts',
        url: `/api/communication/share-text?threadId=${String(posted.body?.threadId)}`,
        token: a.club.adminToken,
        withBody: true,
      },
    ])
    expect(share.result.failure, share.log.slice(-2000)).toBeNull()
    const shared = outputOf(share, 1) as { status: number; body: { url?: string } | null }
    expect(shared.status, JSON.stringify(shared)).toBe(200)
    expect(shared.body?.url).toBe(`${scheme}//${a.slug}.${DOMAIN}/club/messages/${String(posted.body?.threadId)}`)
  } finally {
    await a.club.cleanup()
    await b.club.cleanup()
  }
})
