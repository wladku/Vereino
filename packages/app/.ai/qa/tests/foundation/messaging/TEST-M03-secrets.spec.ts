import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClub } from '../../_fixtures/club'
import { capturedTo, outputOf, runProbe, uniqueAddress, type ProbeDelivery } from '../../_fixtures/messaging'

// TEST-M03 (foundation III REQ-M03, AC-M03; security): a probe template with a personal link built from a raw token in
// the delivery's secret params. The token reaches the e-mail; no event payload, job payload or log line carries it; the
// stored secret is encrypted, and it is null once the delivery is final — after `sent` and after `failed`.
test.describe.configure({ timeout: 600_000 })

test('TEST-M03 secrets: the raw token reaches the e-mail only and is wiped at the final state', async ({ request }) => {
  const club = await createClub(request, 'test-m03')
  try {
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const delivered = {
      personId: randomUUID(),
      email: uniqueAddress('m03-delivered'),
      token: randomBytes(24).toString('hex'),
    }
    const rejected = {
      personId: randomUUID(),
      email: uniqueAddress('m03-rejected'),
      token: randomBytes(24).toString('hex'),
    }
    const recipient = (entry: typeof delivered) => ({
      personId: entry.personId,
      userId: null,
      email: entry.email,
      locale: 'en',
      reasons: ['direct'],
      channels: ['email'],
    })
    const run = runProbe(scope, [
      { op: 'senders', map: { [rejected.email]: 'permanent' } },
      {
        op: 'enqueue',
        template: 'qa_probe.secret_link',
        params: {},
        recipients: [recipient(delivered), recipient(rejected)],
        secrets: { [delivered.personId]: { token: delivered.token }, [rejected.personId]: { token: rejected.token } },
        sourceId: randomUUID(),
        idempotencyKey: `test-m03:${delivered.personId}`,
        publish: false,
        as: 'secret',
      },
      { op: 'deliveries', dispatch: 'secret' },
      { op: 'publish', dispatch: 'secret' },
      { op: 'drain' },
      { op: 'deliveries', dispatch: 'secret' },
    ])
    expect(run.result.failure).toBeNull()

    // Before delivery: each e-mail row holds a secret, stored encrypted (not the raw JSON, not the token).
    const before = (outputOf(run, 2) as { items: ProbeDelivery[] }).items
    expect(before).toHaveLength(2)
    for (const row of before) {
      expect(row.hasSecret).toBe(true)
      expect(row.secretCipherPrefix?.startsWith('{')).toBe(false)
    }

    // After: one sent, one failed — both without a secret and an address; the address hash stays.
    const after = (outputOf(run, 5) as { items: ProbeDelivery[] }).items
    const byPerson = new Map(after.map((row) => [row.personId, row]))
    expect(byPerson.get(delivered.personId)).toMatchObject({ status: 'sent', hasSecret: false, hasEmail: false })
    expect(byPerson.get(rejected.personId)).toMatchObject({
      status: 'failed',
      failureCode: 'provider_rejected',
      hasSecret: false,
      hasEmail: false,
      hasEmailHash: true,
    })

    // The e-mail carries the personal link.
    const mail = capturedTo([delivered.email])
    expect(mail).toHaveLength(1)
    expect(mail[0]?.links.some((link) => link.endsWith(`/p/link/${delivered.token}`))).toBe(true)
    expect(mail[0]?.links.some((link) => /^https?:\/\//.test(link) && link.includes(delivered.token))).toBe(true)
    expect(capturedTo([rejected.email])).toEqual([])

    // No event payload, job payload or log line carries a token; neither does the subject.
    const tokens = [delivered.token, rejected.token]
    const leaks = (value: unknown) => tokens.some((token) => JSON.stringify(value).includes(token))
    expect(run.result.jobPayloads.length).toBeGreaterThan(0)
    expect(leaks(run.result.jobPayloads)).toBe(false)
    expect(run.result.allEventPayloads.length).toBeGreaterThan(0)
    expect(leaks(run.result.allEventPayloads)).toBe(false)
    expect(leaks(run.result.persistedEventPayloads)).toBe(false)
    expect(run.result.events.some((entry) => entry.event === 'foundation.dispatch.delivery_failed')).toBe(true)
    expect(tokens.some((token) => run.log.includes(token))).toBe(false)
    expect(leaks(run.result.sends.map((send) => send.subject))).toBe(false)
  } finally {
    await club.cleanup()
  }
})
