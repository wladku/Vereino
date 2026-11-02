import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createClub } from '../../_fixtures/club'
import {
  capturedTo,
  maxSendsPerWindow,
  outputOf,
  runProbe,
  uniqueAddress,
  type ProbeDelivery,
} from '../../_fixtures/messaging'

// TEST-M02 (foundation III REQ-M02, AC-M02): the dispatch outbox with the probe template and a scripted
// `foundation.emailSender` — one dispatch per key, nothing after a rollback, a transient failure retried until sent,
// one failing transiently until its fifth attempt, a permanent failure at once, a worker that crashes on every attempt,
// a lost lease resumed by the sweeper with at most one resend, one ids-only event per final failure, ≤ 8 e-mails per
// second, a job with another club's tenant and organization refused, `OM_DISABLE_EMAIL_DELIVERY` → skipped, an in-app
// batch replayed → one notification per user. Runs on the local queue strategy (the row decides the retries, not the
// queue); the async strategy needs Redis, which the ephemeral runner does not start.
test.describe.configure({ timeout: 900_000 })

const emailRecipient = (email: string) => ({
  personId: randomUUID(),
  userId: null,
  email,
  locale: 'pl',
  reasons: ['direct'],
  channels: ['email'],
})

test('TEST-M02 dispatch: idempotency, rollback, retries, crash, lost lease, events, rate, scope, disabled, in-app', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m02')
  const other = await createClub(request, 'test-m02-other')
  try {
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const address = {
      failTwice: uniqueAddress('m02-fail-twice'),
      transient: uniqueAddress('m02-transient'),
      permanent: uniqueAddress('m02-permanent'),
      crash: uniqueAddress('m02-crash'),
      ok: uniqueAddress('m02-ok'),
      lostLease: uniqueAddress('m02-lost-lease'),
      rolledBack: uniqueAddress('m02-rolled-back'),
      forged: uniqueAddress('m02-forged'),
      disabled: uniqueAddress('m02-disabled'),
    }
    const bulk = Array.from({ length: 50 }, (_, index) => uniqueAddress(`m02-bulk-${String(index)}`))
    const admin = {
      personId: club.adminPersonId,
      userId: club.adminUserId,
      email: null,
      locale: 'pl',
      reasons: ['direct'],
      channels: ['in_app'],
    }
    const message = {
      template: 'qa_probe.message',
      params: { subject: 'Trening', body: 'Treść' },
      sourceId: randomUUID(),
    }
    const main = [
      admin,
      ...[address.failTwice, address.transient, address.permanent, address.crash, address.ok, address.lostLease].map(
        emailRecipient,
      ),
    ]
    const retryRound = [{ op: 'expire', dispatch: 'main' }, { op: 'sweep' }, { op: 'drain', timeoutMs: 2000 }]

    const run = runProbe(scope, [
      {
        op: 'senders',
        map: {
          [address.failTwice]: 'fail_twice',
          [address.transient]: 'transient',
          [address.permanent]: 'permanent',
          [address.crash]: 'crash',
          [address.lostLease]: 'send_then_hang_once',
        },
      },
      // 1–4: one dispatch per key; a rolled-back caller leaves nothing.
      { op: 'enqueue', ...message, recipients: main, idempotencyKey: `test-m02:${message.sourceId}`, as: 'main' },
      {
        op: 'enqueue',
        ...message,
        recipients: main,
        idempotencyKey: `test-m02:${message.sourceId}`,
        publish: false,
      },
      {
        op: 'enqueue',
        ...message,
        recipients: [emailRecipient(address.rolledBack)],
        idempotencyKey: `test-m02:rollback:${message.sourceId}`,
        rollback: true,
      },
      { op: 'dispatchByKey', key: `test-m02:rollback:${message.sourceId}` },
      // 5: the first pass — one success, a permanent failure, three retries, one crash, one hang after the send.
      { op: 'drain', timeoutMs: 2000 },
      // 6–20: five retry rounds (expire the backoff and the leases, sweep, drain).
      ...retryRound,
      ...retryRound,
      ...retryRound,
      ...retryRound,
      ...retryRound,
      // 21–22: the delivery rows and the dispatch counts.
      { op: 'deliveries', dispatch: 'main' },
      { op: 'dispatch', id: 'main' },
      // 23–26: a job carrying another club's tenant and organization is refused; the right one delivers.
      {
        op: 'enqueue',
        ...message,
        recipients: [emailRecipient(address.forged)],
        idempotencyKey: `test-m02:forged:${message.sourceId}`,
        publish: false,
        as: 'forged',
      },
      {
        op: 'jobFor',
        dispatch: 'forged',
        tenantId: other.tenant.tenantId,
        organizationId: other.tenant.organizationId,
      },
      { op: 'deliveries', dispatch: 'forged' },
      { op: 'jobFor', dispatch: 'forged' },
      // 27–28: 50 recipients at most 8 per second.
      {
        op: 'enqueue',
        ...message,
        recipients: bulk.map(emailRecipient),
        idempotencyKey: `test-m02:bulk:${message.sourceId}`,
        as: 'bulk',
      },
      { op: 'drain', concurrency: 5, timeoutMs: 60_000 },
      // 29–32: delivery switched off → skipped / delivery_disabled.
      { op: 'env', vars: { OM_DISABLE_EMAIL_DELIVERY: '1' } },
      {
        op: 'enqueue',
        ...message,
        recipients: [emailRecipient(address.disabled)],
        idempotencyKey: `test-m02:disabled:${message.sourceId}`,
        as: 'disabled',
      },
      { op: 'drain' },
      { op: 'env', vars: { OM_DISABLE_EMAIL_DELIVERY: null } },
      // 33–35: the in-app batch replayed after a lost status write refreshes the same notification.
      { op: 'requeueInApp', dispatch: 'main' },
      { op: 'jobFor', dispatch: 'main', channel: 'in_app' },
      { op: 'notifications', dispatch: 'main' },
      { op: 'deliveries', dispatch: 'disabled' },
      { op: 'deliveries', dispatch: 'forged' },
    ])
    expect(run.result.failure).toBeNull()

    // One dispatch per key; the rolled-back caller left no dispatch and sent nothing.
    const first = outputOf(run, 1) as { dispatchId: string; created: boolean }
    expect(first.created).toBe(true)
    expect(outputOf(run, 2) as { dispatchId: string; created: boolean }).toEqual({
      dispatchId: first.dispatchId,
      created: false,
    })
    expect((outputOf(run, 3) as { rolledBack: boolean }).rolledBack).toBe(true)
    expect((outputOf(run, 4) as { ids: string[] }).ids).toEqual([])
    expect(capturedTo([address.rolledBack])).toEqual([])

    // Every delivery ends in a final state with the expected attempts and codes.
    const rows = (outputOf(run, 21) as { items: ProbeDelivery[] }).items
    const emailRow = (email: string) => {
      const personId = main.find((recipient) => recipient.email === email)?.personId
      return rows.find((row) => row.personId === personId && row.channel === 'email')
    }
    expect(emailRow(address.failTwice)).toMatchObject({ status: 'sent', attempts: 3, failureCode: null })
    expect(emailRow(address.transient)).toMatchObject({
      status: 'failed',
      attempts: 5,
      failureCode: 'transport_unavailable',
    })
    expect(emailRow(address.permanent)).toMatchObject({
      status: 'failed',
      attempts: 1,
      failureCode: 'provider_rejected',
    })
    expect(emailRow(address.crash)).toMatchObject({
      status: 'failed',
      attempts: 5,
      failureCode: 'transport_unavailable',
    })
    expect(emailRow(address.ok)).toMatchObject({ status: 'sent', attempts: 1 })
    expect(emailRow(address.lostLease)).toMatchObject({ status: 'sent', attempts: 2 })
    expect(rows.find((row) => row.channel === 'in_app')).toMatchObject({ status: 'sent', userId: club.adminUserId })
    for (const row of rows) expect(row.hasEmail, `address wiped at the final state of ${row.id}`).toBe(false)
    expect(outputOf(run, 22) as Record<string, unknown>).toMatchObject({
      status: 'done',
      recipient_count: 7,
      sent_count: 4,
      failed_count: 3,
      skipped_count: 0,
      published: true,
    })

    // At least once, at most one resend after a lost lease; nothing reached the capture for a failed delivery.
    const sendsTo = (email: string) => run.result.sends.filter((send) => send.to === email).length
    expect(sendsTo(address.failTwice)).toBe(1)
    expect(sendsTo(address.ok)).toBe(1)
    expect(sendsTo(address.lostLease)).toBe(2)
    expect(sendsTo(address.transient) + sendsTo(address.permanent) + sendsTo(address.crash)).toBe(0)
    expect(capturedTo([address.lostLease])).toHaveLength(2)
    expect(capturedTo([address.transient, address.permanent, address.crash])).toEqual([])

    // One ids-only event per final failure.
    const failedIds = rows.filter((row) => row.status === 'failed').map((row) => row.id)
    const failures = run.result.events.filter((entry) => entry.event === 'foundation.dispatch.delivery_failed')
    expect(failures.map((entry) => String(entry.payload.id)).sort()).toEqual([...failedIds].sort())
    for (const entry of failures) {
      expect(Object.keys(entry.payload).sort()).toEqual(['dispatchId', 'id', 'organizationId', 'tenantId'])
      expect(entry.payload).toMatchObject({ dispatchId: first.dispatchId, ...scope })
    }

    // The forged job read nothing outside its tenant and organization: no attempt, no send; the right job delivered.
    expect((outputOf(run, 25) as { items: ProbeDelivery[] }).items).toEqual([
      expect.objectContaining({ status: 'queued', attempts: 0 }),
    ])
    expect(run.log).toContain('foundation.dispatch.job_scope_mismatch')
    expect((outputOf(run, 37) as { items: ProbeDelivery[] }).items).toEqual([
      expect.objectContaining({ status: 'sent', attempts: 1 }),
    ])
    expect(sendsTo(address.forged)).toBe(1)

    // 50 recipients: every one sent, never more than 8 in a second.
    const bulkSends = run.result.sends.filter((send) => bulk.includes(send.to))
    expect(bulkSends).toHaveLength(50)
    expect(maxSendsPerWindow(bulkSends.map((send) => send.at))).toBeLessThanOrEqual(8)
    const span = Math.max(...bulkSends.map((send) => send.at)) - Math.min(...bulkSends.map((send) => send.at))
    expect(span).toBeGreaterThanOrEqual(5000)

    // Delivery switched off: skipped, never sent, nothing in the capture.
    expect((outputOf(run, 36) as { items: ProbeDelivery[] }).items).toEqual([
      expect.objectContaining({ status: 'skipped', skipReason: 'delivery_disabled', hasEmail: false }),
    ])
    expect(sendsTo(address.disabled)).toBe(0)
    expect(capturedTo([address.disabled])).toEqual([])

    // The in-app batch replayed: still one notification per user, in the app only.
    const notifications = (outputOf(run, 35) as { items: Array<{ recipient_user_id: string; channels: string[] }> })
      .items
    expect(notifications.map((row) => row.recipient_user_id)).toEqual([club.adminUserId])
    expect(notifications[0]?.channels).toEqual(['in_app'])
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
