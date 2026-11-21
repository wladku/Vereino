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
