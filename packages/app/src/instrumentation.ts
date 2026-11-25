import { isTelemetryBackendEnabled } from '@open-mercato/shared/lib/telemetry/runtime'

export async function register(): Promise<void> {
  // Refuse to serve traffic in production with a missing, placeholder, or too-short JWT signing
  // secret: those tokens are forgeable by anyone who has read the published compose files. Skipped
  // during `next build`, which has no need to sign anything and runs where secrets may be absent.
  if (
    process.env.NEXT_RUNTIME === 'nodejs'
    && process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    // Vereino local patch (engineering standards S8.10, issue #462): refuse to start when a required variable is
    // missing or malformed, naming the variables (never their values) on stderr. Same check as the Railway start
    // scripts run before the server (`scripts/vereino-boot-env.mjs`).
    const { findBootEnvProblems, findBootEnvWarnings, formatBootEnvProblems } = await import('../scripts/vereino-boot-env.mjs')
    const bootEnvMessage = formatBootEnvProblems(findBootEnvProblems(process.env))
    if (bootEnvMessage !== null) {
      const nodeProcess = process
      nodeProcess.stderr.write(`${bootEnvMessage}\n`)
      nodeProcess.exit(1)
    }
    for (const warning of findBootEnvWarnings(process.env)) process.stderr.write(`[vereino] Warning: ${warning}\n`)
    // Vereino local patch (#738): log an outage of the rate limiter's Redis store, which the platform limiter absorbs
    // silently by counting per process.
    const { watchRateLimitStore } = await import('@/modules/foundation/services/rate-limit-store-watch')
    await watchRateLimitStore(process.env)
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
