import { isTelemetryBackendEnabled } from '@open-mercato/shared/lib/telemetry/runtime'

export async function register(): Promise<void> {
  // Refuse to serve traffic in production with a missing, placeholder, or too-short JWT signing
  // secret: those tokens are forgeable by anyone who has read the published compose files. Skipped
  // during `next build`, which has no need to sign anything and runs where secrets may be absent.
  if (
    process.env.NEXT_RUNTIME === 'nodejs'
    && process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    // Vereino local patch (#727): `@open-mercato/cache` loads `ioredis` through `globalThis.__non_webpack_require__`
    // when it is set, else through the bundler. Turbopack's import of ioredis's CommonJS export (the `Redis` class)
    // is a callable wrapper that the cache takes for the constructor, so every `CACHE_STRATEGY=redis` read failed with
    // "Class constructor Redis cannot be invoked without 'new'". Node's own `require` returns the class. Nothing else
    // in the server bundle reads this global (the other readers check `__webpack_require__` first). The server runs
    // in `packages/app`, whose `node_modules` holds ioredis; `scripts/image-smoke.sh` (CI `image-smoke`) checks it.
    const { createRequire } = await import('node:module')
    const { join } = await import('node:path')
    const runtimeGlobal = globalThis as typeof globalThis & { __non_webpack_require__?: NodeJS.Require }
    runtimeGlobal.__non_webpack_require__ ??= createRequire(join(process.cwd(), 'package.json'))
    // Vereino local patch (engineering standards S8.10, issue #462): refuse to start when a required variable is
    // missing or malformed, naming the variables (never their values) on stderr. Same check as the Railway start
    // scripts run before the server (`scripts/vereino-boot-env.mjs`).
    const { findBootEnvProblems, formatBootEnvProblems } = await import('../scripts/vereino-boot-env.mjs')
    const bootEnvMessage = formatBootEnvProblems(findBootEnvProblems(process.env))
    if (bootEnvMessage !== null) {
      const nodeProcess = process
      nodeProcess.stderr.write(`${bootEnvMessage}\n`)
      nodeProcess.exit(1)
    }
    const { assertJwtSecretPolicy } = await import('@open-mercato/shared/lib/auth/jwt')
    try {
      assertJwtSecretPolicy()
    } catch (err) {
      // Next.js reports a throwing instrumentation hook as an unhandled rejection and then leaves
      // the process running, answering 500s — an orchestrator would read that container as healthy
      // and never roll the deployment back. Exit instead, so the misconfiguration is impossible to
      // miss. The message goes straight to stderr because the logger transport may buffer and we
      // are about to terminate.
      const nodeProcess = process
      nodeProcess.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      nodeProcess.exit(1)
    }
  }

  // dev warmup is handled by the dev runner splash flow.
  // Initialize telemetry (no-op unless TELEMETRY_BACKEND is set). OTEL's NodeSDK
  // is Node-only and incompatible with the edge runtime, so the telemetry
  // bootstrap — which can pull in the SDK — is imported only on the Node.js
  // runtime. The helper owns init + graceful degrade + shutdown flush; a
  // deliberate configuration failure bubbles here so the host exits loudly.
  if (
    process.env.NEXT_RUNTIME === 'nodejs'
    && isTelemetryBackendEnabled()
  ) {
    const { registerTelemetryForNextjs } = await import('@open-mercato/telemetry/nextjs')
    try {
      await registerTelemetryForNextjs()
    } catch (err) {
      const nodeProcess = process
      nodeProcess.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      nodeProcess.exit(1)
    }
  }
}
