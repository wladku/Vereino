// The progress service probe (foundation spec TEST-F08, AC-F08; #585): a QA-only process that boots the app the way
// the `mercato` CLI does and swaps the `progressService` registration of every container it creates — a service that
// is stopped (every call throws) or one that breaks after the commit's job started (the first row's progress update
// throws; creating, starting and failing the job reach the real service) — which the running app cannot be made to
// do. It then calls the real import commit route in this process with the caller's bearer token and the import's lock
// token, so the swap applies to its request container.
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/progress-service-probe/probe.mjs '<json>'
//   input: { token, importId, lockToken, mode: 'stopped' | 'breaks' }
//   the last stdout line is the JSON result `{ status, code, calls }`: `code` is the response's error code (null when
//   it has none, never a message or a stack) and `calls` counts the swapped service's calls by method.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { asFunction } from 'awilix'

const input = JSON.parse(process.argv[2] ?? '{}')
if (!process.env.QUEUE_BASE_DIR) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const SERVICE_TOKEN = 'progressService'
const ROUTE = 'modules/people/api/imports/[id]/commit/route.ts'
const LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

const { bootstrapFromAppRoot, compileAppSourceFile } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')
const { commandRegistry } = await import('@open-mercato/shared/lib/commands')

const calls = {}
const count = (method) => {
  calls[method] = (calls[method] ?? 0) + 1
}
const METHODS = [
  'createJob',
  'startJob',
  'updateProgress',
  'incrementProgress',
  'completeJob',
  'failJob',
  'cancelJob',
  'markCancelled',
  'isCancellationRequested',
  'getActiveJobs',
  'getRecentlyCompletedJobs',
  'getJob',
  'markStaleJobsFailed',
]

/** Every method throws: the progress service is down. */
function stoppedService() {
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      async () => {
        count(method)
        throw new Error('[probe] the progress service is stopped')
      },
    ]),
  )
}

/** The real service, except that every progress update throws once the job has started. */
function breakingService(real) {
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      async (...args) => {
        count(method)
        if (method === 'incrementProgress' || method === 'updateProgress') {
          throw new Error('[probe] the progress service stopped during the commit')
        }
        return real[method](...args)
      },
    ]),
  )
}

di.registerDiRegistrars([
  ...di.getDiRegistrars(),
  (container) => {
    const original = container.registrations[SERVICE_TOKEN]
    container.register(
      SERVICE_TOKEN,
      asFunction(() =>
        input.mode === 'stopped' ? stoppedService() : breakingService(original.resolve(container)),
      ).scoped(),
    )
  },
])

// The route bundle may carry its own copy of the module's commands, which the bootstrap already registered: in this
// process a registration replaces the handler of the same id instead of failing as a duplicate.
const register = commandRegistry.register
commandRegistry.register = (handler) => {
  commandRegistry.unregister(handler?.id)
  return register.call(commandRegistry, handler)
}

const source = path.join(process.cwd(), 'src', ROUTE)
const outFile = path.join(
  process.cwd(),
  'node_modules',
  '.cache',
  'vereino-probe',
  `${ROUTE.replace(/[\\/.[\]]/g, '_')}.mjs`,
)
const handler = await import(
  pathToFileURL(await compileAppSourceFile(source, { appRoot: process.cwd(), outFile })).href
)
const response = await handler.POST(
  new Request(`http://localhost/api/people/imports/${input.importId}/commit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.token}`, [LOCK_HEADER]: input.lockToken },
  }),
  { params: Promise.resolve({ id: input.importId }) },
)
const body = await response.json().catch(() => null)
process.stdout.write(`\n${JSON.stringify({ status: response.status, code: body?.code ?? null, calls })}\n`, () =>
  process.exit(0),
)
