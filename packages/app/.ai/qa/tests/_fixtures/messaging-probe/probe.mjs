// The foundation III probe (TEST-M01…M04; TEST-M05 and TEST-M07 of phase B, #35; spec *Implementation Phases*): a
// QA-only process that boots the app the way the `mercato` CLI does, adds the probe templates, the probe in-app type
// and a scripted `foundation.emailSender` to every container it creates, and runs a script of steps against the real
// services, workers and database. Jobs go to a private local queue (`QUEUE_BASE_DIR`, set by the caller), so the
// running app's workers never see them and the probe drains them itself with the real `foundation:dispatch-deliver`
// and `foundation:dispatch-sweep` handlers.
//
// Usage (cwd = packages/app): node .ai/qa/tests/_fixtures/messaging-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, steps: [{ op, ... }] } — the last stdout line is the JSON result.
// It prints ids, statuses, codes and subjects only; never an address, a body or a secret.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { asValue } from 'awilix'
import { PROBE_NOTIFICATION_TYPE, probeTemplates } from './templates.mjs'

const input = JSON.parse(process.argv[2] ?? '{}')
const queueBaseDir = process.env.QUEUE_BASE_DIR
if (!queueBaseDir) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
const bootstrapData = await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')
const { sendEmail } = await import('@open-mercato/shared/lib/email/send')
const { registerNotificationTypes } =
  await import('@open-mercato/core/modules/notifications/lib/notification-type-registry')
const { registerNotificationDeliveryStrategyEntries } =
  await import('@open-mercato/core/modules/notifications/lib/delivery-strategies-registry')
const platformStrategies = await import('@open-mercato/core/modules/notifications/notifications.delivery-strategies')

// The platform registers its notification delivery strategies (in-app, e-mail) only in the Next.js runtime
// (`runBootstrapRegistrations`); its CLI and worker processes have none, so a notification created there stores
// `channels: null` and is delivered by no strategy. The probe registers them as the web runtime does — the worst case
// for a second e-mail: the create-time gate must then keep a Vereino type on `in_app` even with an operator override.
registerNotificationDeliveryStrategyEntries([
  { moduleId: 'notifications', strategies: platformStrategies.default ?? platformStrategies.deliveryStrategies },
])

// --- the scripted sender -------------------------------------------------------------------------------------------

/** Behaviour per address: ok | fail_twice | transient | permanent | crash | send_then_hang_once. */
const behaviours = new Map()
const callsByAddress = new Map()
/** Every send that reached the platform's `sendEmail` (the capture): address, subject, time and rendered HTML. */
const sends = []

function transientError() {
  return new Error('socket hang up')
}

const probeSender = {
  async send(options) {
    const startedAt = Date.now()
    const calls = (callsByAddress.get(options.to) ?? 0) + 1
    callsByAddress.set(options.to, calls)
    const behaviour = behaviours.get(options.to) ?? 'ok'
    if (behaviour === 'transient') throw transientError()
    if (behaviour === 'permanent') throw Object.assign(new Error('Domain not verified'), { status: 403 })
    if (behaviour === 'fail_twice' && calls <= 2) throw transientError()
    // A worker that dies mid-send: the job never finishes, the lease stays taken until it expires.
    if (behaviour === 'crash') return new Promise(() => {})
    await sendEmail(options)
    sends.push({ to: options.to, subject: options.subject, at: startedAt, html: renderToStaticMarkup(options.react) })
    // Sent, then the worker dies before it writes the status: the sweeper must resend once.
    if (behaviour === 'send_then_hang_once' && calls === 1) return new Promise(() => {})
  },
}

let hiddenTokens = new Set()

function probeRegistrar(container) {
  registerNotificationTypes([PROBE_NOTIFICATION_TYPE])
  container.register({ 'foundation.emailSender': asValue(probeSender) })
  const templates = container.resolve('foundationEmailTemplates')
  for (const template of probeTemplates(templates.clubText)) templates.registerEmailTemplate(container, template)
  // A deployment without some providers (TEST-M01: an unregistered kind): the container reports them absent.
  if (hiddenTokens.size > 0) {
    const has = container.hasRegistration.bind(container)
    container.hasRegistration = (name) => (hiddenTokens.has(String(name)) ? false : has(name))
  }
}
di.registerDiRegistrars([...di.getDiRegistrars(), probeRegistrar])

// --- recorded events -----------------------------------------------------------------------------------------------

const events = []
const BUS_KEY = '__openMercatoGlobalEventBus__'

/** Wraps a bus so every event it emits is recorded (once per bus object). */
function recording(bus) {
  if (!bus || typeof bus.emit !== 'function' || bus.__probeRecording) return bus
  const emit = bus.emit.bind(bus)
  bus.emit = async (event, payload, options) => {
    events.push({ event, payload })
    return emit(event, payload, options)
  }
  bus.__probeRecording = true
  return bus
}

// Every request container (the worker's own included) creates its event bus and publishes it under this global key,
// which `createModuleEvents().emit` reads; the property wraps each bus as it is published.
let currentBus = recording(globalThis[BUS_KEY])
Object.defineProperty(globalThis, BUS_KEY, {
  configurable: true,
  get: () => currentBus,
  set: (bus) => {
    currentBus = recording(bus)
  },
})

// --- helpers -------------------------------------------------------------------------------------------------------

const foundation = bootstrapData.modules.find((module) => module.id === 'foundation')
const deliverWorker = foundation?.workers?.find((worker) => worker.id === 'foundation:dispatch-deliver')
const sweepWorker = foundation?.workers?.find((worker) => worker.id === 'foundation:dispatch-sweep')
if (!deliverWorker || !sweepWorker) throw new Error('[internal] the foundation workers are not registered')

const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const queueFile = path.join(queueBaseDir, 'foundation-dispatch', 'queue.json')
/** Every job payload the probe ever took off the queue (TEST-M03 scans them for secrets). */
const jobPayloads = []

async function newContainer() {
  return di.createRequestContainer()
}

function codedError(error) {
  return {
    status: typeof error?.status === 'number' ? error.status : 500,
    code: error?.body?.code ?? null,
    fingerprint: error?.fingerprint ?? null,
    message: error?.body?.error ?? (error instanceof Error ? error.message.slice(0, 200) : String(error)),
  }
}

/** The command-context-like object `resolveScope` reads: the author's session in the club. */
async function authorScope(container, authorUserId) {
  if (!authorUserId) return [{ kind: 'system_job' }]
  const contract = container.resolve('foundationScopeContract')
  return contract.resolve({
    container,
    auth: { sub: authorUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
    selectedOrganizationId: scope.organizationId,
  })
}

function takeQueuedJobs() {
  if (!fs.existsSync(queueFile)) return []
  const jobs = JSON.parse(fs.readFileSync(queueFile, 'utf8') || '[]')
  fs.writeFileSync(queueFile, '[]')
  return jobs
}

/** Runs the queued jobs with the real worker, `concurrency` at a time; a job still running after `timeoutMs` is abandoned. */
async function drain({ concurrency = 5, timeoutMs = 3000 } = {}) {
  const outcomes = []
  for (;;) {
    const jobs = takeQueuedJobs()
    if (jobs.length === 0) break
    let index = 0
    const run = async () => {
      while (index < jobs.length) {
        const job = jobs[index]
        index += 1
        jobPayloads.push(job.payload)
        const handled = deliverWorker
          .handler(
            { id: job.id, payload: job.payload, createdAt: job.createdAt },
            {
              jobId: job.id,
              attemptNumber: 1,
              queueName: 'foundation-dispatch',
            },
          )
          .then(() => 'done')
        handled.catch(() => {})
        const outcome = await Promise.race([handled, delay(timeoutMs).then(() => 'abandoned')])
        outcomes.push({ payload: job.payload, outcome })
      }
    }
    await Promise.all(Array.from({ length: concurrency }, run))
  }
  return outcomes
}

async function rows(sql, params) {
  const container = await newContainer()
  return container.resolve('em').fork().execute(sql, params)
}

async function deliveries(dispatchId) {
  const result = await rows(
    `select id, person_id, user_id, channel, locale, reasons, status, skip_reason, failure_code, attempts,
       email is not null as has_email, email_hash is not null as has_email_hash,
       secret_params is not null as has_secret, secret_params as secret_cipher
     from foundation_deliveries where dispatch_id = ? and tenant_id = ? and organization_id = ? order by person_id, channel`,
    [dispatchId, scope.tenantId, scope.organizationId],
  )
  return result.map((row) => ({
    id: row.id,
    personId: row.person_id,
    userId: row.user_id,
    channel: row.channel,
    locale: row.locale,
    reasons: row.reasons,
    status: row.status,
    skipReason: row.skip_reason,
    failureCode: row.failure_code,
    attempts: Number(row.attempts),
    hasEmail: row.has_email,
    hasEmailHash: row.has_email_hash,
    hasSecret: row.has_secret,
    // Only a prefix of the stored ciphertext: enough to show it is not the raw JSON, too short to leak anything.
    secretCipherPrefix: row.secret_cipher ? String(row.secret_cipher).slice(0, 8) : null,
  }))
}

// --- steps ---------------------------------------------------------------------------------------------------------

const named = new Map()
const resolveRef = (value) => (typeof value === 'string' && named.has(value) ? named.get(value) : value)

async function runStep(step) {
  switch (step.op) {
    case 'senders': {
      for (const [address, behaviour] of Object.entries(step.map)) behaviours.set(address, behaviour)
      return { ok: true }
    }
    case 'env': {
      for (const [key, value] of Object.entries(step.vars)) {
        if (value === null) delete process.env[key]
        else process.env[key] = value
      }
      return { ok: true }
    }
    case 'hideProviders': {
      hiddenTokens = new Set(step.tokens)
      return { ok: true }
    }
    case 'audience': {
      const container = await newContainer()
      try {
        const resolved = await container
          .resolve('foundationAudience')
          .resolveAudience(
            step.spec,
            { container, ...scope, scope: await authorScope(container, step.authorUserId) },
            { exclude: step.exclude ?? [] },
          )
        return {
          counts: resolved.counts,
          today: resolved.today,
          recipients: resolved.recipients.map((recipient) => ({
            personId: recipient.personId,
            userId: recipient.userId,
            hasEmail: Boolean(recipient.email),
            locale: recipient.locale,
            reasons: recipient.reasons,
            channels: recipient.channels,
          })),
        }
      } catch (error) {
        return { error: codedError(error) }
      }
    }
    case 'enqueue': {
      const container = await newContainer()
      const em = container.resolve('em').fork()
      const service = container.resolve('foundationDispatch')
      const authorScopeValue = await authorScope(container, step.authorUserId)
      try {
        const result = await em.transactional(async (tx) => {
          const enqueued = await service.enqueue(
            tx,
            {
              template: step.template,
              params: step.params,
              ...(step.recipients ? { recipients: step.recipients } : {}),
              ...(step.audience ? { audience: step.audience } : {}),
              exclude: step.exclude ?? [],
              source: { module: 'qa_probe', type: 'qa_probe:message', id: step.sourceId },
              idempotencyKey: step.idempotencyKey,
              secrets: step.secrets ? new Map(Object.entries(step.secrets)) : undefined,
              actor: { userId: step.authorUserId ?? null, actingRole: step.authorUserId ? 'club_admin' : 'system' },
            },
            { ...scope, scope: authorScopeValue },
          )
          if (step.rollback) throw Object.assign(new Error('probe rollback'), { probeRollback: true, enqueued })
          return enqueued
        })
        if (step.publish !== false) await service.publish(result.dispatchId, scope)
        if (step.as) named.set(step.as, result.dispatchId)
        return result
      } catch (error) {
        if (error?.probeRollback) return { rolledBack: true, dispatchId: error.enqueued.dispatchId }
        return { error: codedError(error) }
      }
    }
    case 'drain':
      return { outcomes: await drain(step) }
    case 'jobFor': {
      // The job of a dispatch's e-mail delivery to `email`'s person or of its in-app rows, with an optional forged scope.
      const dispatchId = resolveRef(step.dispatch)
      let payload
      if (step.channel === 'in_app') {
        payload = { dispatchId }
      } else {
        const [row] = await rows(
          `select id from foundation_deliveries where dispatch_id = ? and channel = 'email' and tenant_id = ?
             and organization_id = ? order by id limit 1`,
          [dispatchId, scope.tenantId, scope.organizationId],
        )
        payload = { deliveryId: row.id }
      }
      payload.tenantId = step.tenantId ?? scope.tenantId
      payload.organizationId = step.organizationId ?? scope.organizationId
      jobPayloads.push(payload)
      await deliverWorker.handler(
        { id: 'probe', payload, createdAt: new Date().toISOString() },
        {
          jobId: 'probe',
          attemptNumber: 1,
          queueName: 'foundation-dispatch',
        },
      )
      return { ok: true }
    }
    case 'routeGet': {
      // A GET on an app route handler in this process, so `hideProviders` applies to its request container
      // (UX parity spec TEST-U03: the people list without `groups.personFilter`). Prints the status, the error code and
      // the listed ids only.
      const { compileAppSourceFile } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
      const source = path.join(process.cwd(), 'src', step.source)
      const outFile = path.join(queueBaseDir, 'routes', `${step.source.replace(/[\\/.]/g, '_')}.mjs`)
      const compiled = await compileAppSourceFile(source, { appRoot: process.cwd(), outFile })
      const route = await import(pathToFileURL(compiled).href)
      const response = await route.GET(
        new Request(`http://localhost${step.url}`, { headers: { authorization: `Bearer ${step.token}` } }),
      )
      const body = await response.json().catch(() => null)
      const items = Array.isArray(body?.items) ? body.items : null
      return {
        status: response.status,
        code: body?.code ?? null,
        ids: items ? items.map((item) => item.id) : null,
        withGroups: items ? items.filter((item) => item._groups !== undefined).length : null,
      }
    }
    case 'publish': {
      const container = await newContainer()
      await container.resolve('foundationDispatch').publish(resolveRef(step.dispatch), scope)
      return { ok: true }
    }
    case 'expire': {
      // Time travel for one dispatch: its retries are due now and every lease has run out.
      await rows(
        `update foundation_deliveries set next_attempt_at = now() - interval '1 second',
           lease_expires_at = case when lease_expires_at is null then null else now() - interval '1 second' end
         where dispatch_id = ? and tenant_id = ? and organization_id = ? and status = 'queued'`,
        [resolveRef(step.dispatch), scope.tenantId, scope.organizationId],
      )
      return { ok: true }
    }
    case 'requeueInApp': {
      // A lost status write after the in-app batch: the row is queued again and its job replayed.
      await rows(
        `update foundation_deliveries set status = 'queued', sent_at = null, attempts = 0, lease_owner = null,
           lease_expires_at = null, next_attempt_at = now() - interval '1 second'
         where dispatch_id = ? and tenant_id = ? and organization_id = ? and channel = 'in_app'`,
        [resolveRef(step.dispatch), scope.tenantId, scope.organizationId],
      )
      return { ok: true }
    }
    case 'sweep': {
      await sweepWorker.handler(
        { id: 'probe-sweep', payload: scope, createdAt: new Date().toISOString() },
        {
          jobId: 'probe-sweep',
          attemptNumber: 1,
          queueName: 'foundation-dispatch-sweep',
        },
      )
      return { ok: true }
    }
    case 'deliveries':
      return { items: await deliveries(resolveRef(step.dispatch)) }
    case 'dispatch': {
      const [row] = await rows(
        `select id, template_id, status, recipient_count, sent_count, failed_count, skipped_count,
           published_at is not null as published, params as params_cipher
         from foundation_dispatches where id = ? and tenant_id = ? and organization_id = ?`,
        [resolveRef(step.id), scope.tenantId, scope.organizationId],
      )
      return row ? { ...row, params_cipher: String(row.params_cipher).slice(0, 8) } : null
    }
    case 'dispatchByKey': {
      const found = await rows(
        'select id from foundation_dispatches where idempotency_key = ? and tenant_id = ? and organization_id = ?',
        [step.key, scope.tenantId, scope.organizationId],
      )
      return { ids: found.map((row) => row.id) }
    }
    case 'notifications': {
      const found = await rows(
        `select recipient_user_id, type, title, body, title_key, body_key, title_variables, body_variables, channels,
           group_key
         from notifications where group_key = ? and tenant_id = ? order by recipient_user_id`,
        [resolveRef(step.dispatch), scope.tenantId],
      )
      return { items: found }
    }
    case 'command': {
      // A module command run as a member of the club (`authorUserId`) or as a job (`system_job`), `times` copies at
      // once (TEST-M07: a cancellation event delivered concurrently). Dispatches it publishes land on the private queue.
      const runOnce = async () => {
        const container = await newContainer()
        const ctx = step.authorUserId
          ? {
              container,
              auth: { sub: step.authorUserId, tenantId: scope.tenantId, orgId: scope.organizationId },
              organizationScope: {
                selectedId: scope.organizationId,
                filterIds: [scope.organizationId],
                allowedIds: [scope.organizationId],
                tenantId: scope.tenantId,
              },
              selectedOrganizationId: scope.organizationId,
              organizationIds: [scope.organizationId],
            }
          : container.resolve('foundationAuthorization').jobCommandContext(container, scope)
        try {
          const { result } = await container.resolve('commandBus').execute(step.id, { input: step.input, ctx })
          return { result: result ?? null }
        } catch (error) {
          return { error: codedError(error) }
        }
      }
      const results = await Promise.all(Array.from({ length: step.times ?? 1 }, runOnce))
      return { results }
    }
    case 'override': {
      await rows(
        `insert into notification_type_overrides (id, tenant_id, notification_type_id, channels, created_at, updated_at)
         values (gen_random_uuid(), ?, ?, ?::jsonb, now(), now())`,
        [scope.tenantId, step.typeId, JSON.stringify(step.channels)],
      )
      return { ok: true }
    }
    default:
      throw new Error(`[internal] unknown probe step ${String(step.op)}`)
  }
}

const outputs = []
let failure = null
try {
  for (const step of input.steps ?? []) outputs.push(await runStep(step))
} catch (error) {
  failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

const eventsQueueFile = path.join(queueBaseDir, 'events', 'queue.json')
const persistedEvents = fs.existsSync(eventsQueueFile) ? JSON.parse(fs.readFileSync(eventsQueueFile, 'utf8')) : []
const result = {
  failure,
  outputs,
  sends,
  events: events.filter((entry) => String(entry.event).startsWith('foundation.')),
  allEventPayloads: events.map((entry) => entry.payload),
  persistedEventPayloads: persistedEvents.map((job) => job.payload),
  jobPayloads,
}
process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
