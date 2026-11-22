// The occupancy provider probe (foundation II TEST-G04, AC-G03; #590): a QA-only process that boots the app the way the
// `mercato` CLI does and swaps the `vereino.occupancyProvider` registration of every container it creates — a provider
// that throws, or no provider at all (a deployment without `facilities`) — which the running app, whose `facilities`
// module always registers the provider, cannot be. It then calls the real activity routes (preview and create) in this
// process with the caller's bearer token, so the swap applies to their request containers.
//
// Usage (cwd = packages/app, a private QUEUE_BASE_DIR): node .ai/qa/tests/_fixtures/occupancy-provider-probe/probe.mjs '<json>'
//   input: { token, steps: [{ provider: 'throwing' | 'absent', op: 'preview' | 'create', body }] }
//   the last stdout line is the JSON result `{ steps: [{ registered, calls, status, code, body }] }`: `registered` says
//   whether the route's container had the token, `calls` how often the throwing provider ran, `code` is the response's
//   error code (null when it has none) and `body` the response for a 2xx, else null (an error body is reduced to its
//   code, never a message or a stack).
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { asValue } from 'awilix'

const input = JSON.parse(process.argv[2] ?? '{}')
if (!process.env.QUEUE_BASE_DIR) throw new Error('[internal] the probe needs a private QUEUE_BASE_DIR')

const PROVIDER_TOKEN = 'vereino.occupancyProvider'
const ROUTES = {
  preview: 'modules/activities/api/activities/preview/route.ts',
  create: 'modules/activities/api/activities/route.ts',
}
const URLS = {
  preview: '/api/activities/activities/preview',
  create: '/api/activities/activities',
}

const { bootstrapFromAppRoot, compileAppSourceFile } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')
const { commandRegistry } = await import('@open-mercato/shared/lib/commands')

/** The provider swap of the current step; the registrar below reads it for every container a route creates. */
let provider = 'throwing'
let registered = null
let calls = 0
const throwingProvider = {
  async blockingIntervals() {
    calls += 1
    throw new Error('[probe] the occupancy provider is down')
  },
}
di.registerDiRegistrars([
  ...di.getDiRegistrars(),
  (container) => {
    if (provider === 'throwing') container.register(PROVIDER_TOKEN, asValue(throwingProvider))
    const has = container.hasRegistration.bind(container)
    container.hasRegistration = (name) => {
      const found = provider === 'absent' && String(name) === PROVIDER_TOKEN ? false : has(name)
      if (String(name) === PROVIDER_TOKEN) registered = found
      return found
    }
  },
])

// The route bundles carry their own copy of the module's commands (`makeCrudRoute` loads them, also lazily on the
// first write), which the bootstrap already registered: in this process a registration replaces the handler of the
// same id, as the platform registry does in development, instead of failing as a duplicate.
const register = commandRegistry.register
commandRegistry.register = (handler) => {
  commandRegistry.unregister(handler?.id)
  return register.call(commandRegistry, handler)
}

const compiled = {}
async function route(op) {
  if (!compiled[op]) {
    const source = path.join(process.cwd(), 'src', ROUTES[op])
    // Under the app root, so the bundle's package imports resolve from the app's `node_modules`.
    const outFile = path.join(
      process.cwd(),
      'node_modules',
      '.cache',
      'vereino-probe',
      `${ROUTES[op].replace(/[\\/.]/g, '_')}.mjs`,
    )
    const href = pathToFileURL(await compileAppSourceFile(source, { appRoot: process.cwd(), outFile })).href
    compiled[op] = await import(href)
  }
  return compiled[op]
}

const steps = []
for (const step of input.steps ?? []) {
  provider = step.provider
  registered = null
  calls = 0
  const handler = await route(step.op)
  const response = await handler.POST(
    new Request(`http://localhost${URLS[step.op]}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${input.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(step.body ?? {}),
    }),
  )
  const body = await response.json().catch(() => null)
  const ok = response.status >= 200 && response.status < 300
  steps.push({ registered, calls, status: response.status, code: body?.code ?? null, body: ok ? body : null })
}

process.stdout.write(`\n${JSON.stringify({ steps })}\n`, () => process.exit(0))
