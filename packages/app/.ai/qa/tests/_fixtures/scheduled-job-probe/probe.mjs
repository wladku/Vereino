// The TEST-G06 probe (foundation II AC-G05, #591): a QA-only process that boots the app the way the `mercato` CLI
// does and drives one scheduled job the way production does — the platform's `scheduler-execution` worker loads the
// registration, sanitises the payload and enqueues the target job with the registration's scope, and the module's
// worker takes it from the queue. Jobs go to a private local queue (`QUEUE_BASE_DIR`, set by the caller), so the
// running app's workers never see them. Every command a worker dispatches is recorded with its organization.
//
// Usage (cwd = packages/app): node .ai/qa/tests/_fixtures/scheduled-job-probe/probe.mjs '<json>'
//   input: { steps: [{ op: 'execute', scheduleId, tenantId, organizationId } | { op: 'run', worker, payload }] }
//   — the last stdout line is the JSON result. It prints ids, queue payload keys and command ids only.
import fs from 'node:fs'
import path from 'node:path'

const input = JSON.parse(process.argv[2] ?? '{}')
const queueBaseDir = process.env.QUEUE_BASE_DIR
if (!queueBaseDir) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
const bootstrapData = await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

/** Every command a worker dispatched: its id and the organization of its context. */
const commands = []

function recordingRegistrar(container) {
  if (!container.hasRegistration('commandBus')) return
  const bus = container.resolve('commandBus')
  if (bus.__probeRecording) return
  const execute = bus.execute.bind(bus)
  bus.execute = async (commandId, options) => {
    commands.push({ commandId, organizationId: options?.ctx?.selectedOrganizationId ?? null })
    return execute(commandId, options)
  }
  bus.__probeRecording = true
}
di.registerDiRegistrars([...di.getDiRegistrars(), recordingRegistrar])

const allWorkers = bootstrapData.modules.flatMap((module) => module.workers ?? [])
const executeWorker = allWorkers.find((worker) => worker.queue === 'scheduler-execution')
if (!executeWorker) throw new Error('[internal] the platform scheduler-execution worker is not registered')

function workerById(id) {
  const worker = allWorkers.find((entry) => entry.id === id)
  if (!worker) throw new Error(`[internal] worker ${id} is not registered`)
  return worker
}

/** Takes every job off a private local queue. */
function takeQueuedJobs(queue) {
  const file = path.join(queueBaseDir, queue, 'queue.json')
  if (!fs.existsSync(file)) return []
  const jobs = JSON.parse(fs.readFileSync(file, 'utf8') || '[]')
  fs.writeFileSync(file, '[]')
  return jobs
}

async function runStep(step) {
  switch (step.op) {
    case 'execute': {
      // The platform's execute worker, as a scheduler firing hands it one schedule.
      const container = await di.createRequestContainer()
      const ctx = {
        jobId: `probe-g06-${String(Date.now())}`,
        attemptNumber: 1,
        queueName: 'scheduler-execution',
        resolve: (name) => container.resolve(name),
      }
      try {
        await executeWorker.handler(
          {
            id: ctx.jobId,
            payload: {
              scheduleId: step.scheduleId,
              tenantId: step.tenantId,
              organizationId: step.organizationId,
              scopeType: 'organization',
              triggerType: 'scheduled',
            },
            createdAt: new Date().toISOString(),
          },
          ctx,
        )
      } catch (error) {
        return { error: error instanceof Error ? error.message.slice(0, 200) : String(error), queued: [] }
      }
      return { error: null, queued: takeQueuedJobs(step.queue).map((job) => job.payload) }
    }
    case 'run': {
      // The module's worker, as the queue hands it one job.
      const before = commands.length
      const worker = workerById(step.worker)
      await worker.handler(
        { id: 'probe-g06-run', payload: step.payload, createdAt: new Date().toISOString() },
        { jobId: 'probe-g06-run', attemptNumber: 1, queueName: worker.queue },
      )
      return { commands: commands.slice(before) }
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
process.stdout.write(`\n${JSON.stringify({ failure, outputs })}\n`, () => process.exit(0))
