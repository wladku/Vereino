// Boot-time check of the required environment variables (engineering standards S8.10, ADR-013; issue #462).
//
// The app refuses to start when a required variable is missing or malformed and names every such variable on
// stderr, never its value. Two callers run the same check:
//   - `src/instrumentation.ts` (Next.js `register()`): every app start, including `yarn start` in the integration
//     test runner and the sandbox;
//   - `scripts/railway-start.sh` and `scripts/railway-worker.sh` through the CLI below, before anything else runs:
//       node packages/app/scripts/vereino-boot-env.mjs
//     exits 0 when the environment is complete, 1 naming the variables otherwise.
//
// A new required variable is one row in REQUIRED_VARIABLES, listed in `packages/app/.env.example` with a placeholder
// and by name in `docs/ops/deploy.md`. Vereino's own variables use the `VEREINO_` prefix; none is required at boot yet.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const present = z.string().trim().min(1)
const postgresUrl = present.regex(/^postgres(ql)?:\/\/\S+$/)
const httpUrl = present.regex(/^https?:\/\/\S+$/)

/** @param {Record<string, string | undefined>} env */
const isProduction = (env) => env.NODE_ENV === 'production'

/**
 * Required variables. `when` limits a row to the environments that need it; `anyOf` accepts the first alternative
 * that is set (platform Redis lookup order: `<PREFIX>_REDIS_URL`, then `REDIS_URL`).
 * @type {ReadonlyArray<{ names: readonly string[], schema: z.ZodType, reason: string, when?: (env: Record<string, string | undefined>) => boolean }>}
 */
export const REQUIRED_VARIABLES = [
  { names: ['DATABASE_URL'], schema: postgresUrl, reason: 'a postgres:// connection URL' },
  { names: ['JWT_SECRET'], schema: present, reason: 'the token signing secret', when: isProduction },
  { names: ['APP_URL'], schema: httpUrl, reason: 'the public http(s) base URL', when: isProduction },
  {
    names: ['CACHE_REDIS_URL', 'REDIS_URL'],
    schema: present,
    reason: 'a Redis URL, because CACHE_STRATEGY=redis',
    when: (env) => env.CACHE_STRATEGY === 'redis',
  },
  {
    names: ['QUEUE_REDIS_URL', 'REDIS_URL'],
    schema: present,
    reason: 'a Redis URL, because QUEUE_STRATEGY=async',
    when: (env) => env.QUEUE_STRATEGY === 'async',
  },
]

/** @param {Record<string, string | undefined>} env */
const onRailway = (env) => (env.RAILWAY_ENVIRONMENT_NAME ?? '').trim() !== ''
/** @param {string | undefined} value */
const isFalse = (value) => ['false', '0', 'no', 'off'].includes((value ?? '').trim().toLowerCase())
/** @param {string | undefined} value */
const isTrue = (value) => ['true', '1', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())

/**
 * Rate-limit settings a deployment must not run with (#738). The platform limiter reads only `REDIS_URL`, falls back
 * to per-process counters without a word when the strategy has no URL, and is switched off by `RATE_LIMIT_ENABLED`
 * false or `OM_INTEGRATION_TEST`. On Railway (`RAILWAY_ENVIRONMENT_NAME`, set by the platform) the counters must live in
 * Redis so they are shared by instances and survive a deploy.
 * @type {ReadonlyArray<{ problem: string, when: (env: Record<string, string | undefined>) => boolean }>}
 */
export const RATE_LIMIT_RULES = [
  {
    problem: 'RATE_LIMIT_STRATEGY is invalid (expected memory or redis)',
    when: (env) => env.RATE_LIMIT_STRATEGY !== undefined && !['memory', 'redis'].includes(env.RATE_LIMIT_STRATEGY),
  },
  {
    problem: 'REDIS_URL is missing (the rate limiter reads it, because RATE_LIMIT_STRATEGY=redis)',
    when: (env) => env.RATE_LIMIT_STRATEGY === 'redis' && (env.REDIS_URL ?? '').trim() === '',
  },
  {
    problem: 'RATE_LIMIT_TRUST_PROXY_DEPTH is invalid (expected a whole number of trusted proxies)',
    when: (env) => {
      const depth = (env.RATE_LIMIT_TRUST_PROXY_DEPTH ?? '').trim()
      return depth !== '' && !/^\d+$/.test(depth)
    },
  },
  {
    problem: 'RATE_LIMIT_STRATEGY must be redis on Railway (shared counters that survive a deploy)',
    when: (env) => onRailway(env) && env.RATE_LIMIT_STRATEGY !== 'redis',
  },
  {
    problem: 'RATE_LIMIT_ENABLED must not be false on Railway',
    when: (env) => onRailway(env) && isFalse(env.RATE_LIMIT_ENABLED),
  },
  {
    problem: 'OM_INTEGRATION_TEST must not be set on Railway (it switches rate limits off)',
    when: (env) => onRailway(env) && isTrue(env.OM_INTEGRATION_TEST),
  },
]

/**
 * Settings that let the app start but weaken it, printed as warnings. The proxy depth is not a stop: it must be
 * measured on the running environment (`docs/ops/deploy.md` → *Rate limits*), which needs the app up.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function findBootEnvWarnings(env) {
  const depth = (env.RATE_LIMIT_TRUST_PROXY_DEPTH ?? '').trim()
  if (onRailway(env) && (depth === '' || depth === '0')) {
    return [
      'RATE_LIMIT_TRUST_PROXY_DEPTH is unset or 0 behind the Railway proxy: every client shares one rate-limit counter (docs/ops/deploy.md, Rate limits)',
    ]
  }
  return []
}

/**
 * Every required variable that is missing or malformed in `env`. Problems name variables only; values never leave
 * this function.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function findBootEnvProblems(env) {
  const problems = []
  for (const { names, schema, reason, when } of REQUIRED_VARIABLES) {
    if (when && !when(env)) continue
    const setName = names.find((name) => (env[name] ?? '').trim() !== '')
    if (setName === undefined) {
      problems.push(`${names.join(' or ')} is missing (${reason})`)
      continue
    }
    if (!schema.safeParse(env[setName]).success) problems.push(`${setName} is invalid (expected ${reason})`)
  }
  for (const rule of RATE_LIMIT_RULES) if (rule.when(env)) problems.push(rule.problem)
  return problems
}

/**
 * The stderr message for `problems`, or `null` when there is none.
 * @param {string[]} problems
 * @returns {string | null}
 */
export function formatBootEnvProblems(problems) {
  if (problems.length === 0) return null
  const lines = problems.map((problem) => `  - ${problem}`)
  return `[vereino] Refusing to start: required environment variables are missing or invalid (S8.10):\n${lines.join('\n')}\nSee packages/app/.env.example and docs/ops/deploy.md.`
}

/**
 * Exit code of the check for `env`: 0 when complete, 1 after writing the problems to `error`.
 * @param {{ env?: Record<string, string | undefined>, error?: (message: string) => void }} [options]
 * @returns {number}
 */
export function runCli({ env = process.env, error = (message) => process.stderr.write(`${message}\n`) } = {}) {
  const message = formatBootEnvProblems(findBootEnvProblems(env))
  if (message === null) return 0
  error(message)
  return 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli()
}
