// The social sign-in probe (spec TEST-S01/S02, #566): a QA-only process that boots the app the way the `mercato` CLI
// does and runs read steps — and one write the API cannot do — against the ephemeral test database:
//   `link`          the identity-link rows of (provider, subject): count, owner, scope, last sign-in, and whether the
//                   stored e-mail column holds the plain address (it must not: P-09 encryption)
//   `userCount`     the number of platform users (no sign-in route ever creates one)
//   `clearPassword` removes a user's password, so a Google link becomes the account's only sign-in method
//
// Usage (cwd = packages/app): node .ai/qa/tests/_fixtures/identity-probe/probe.mjs '<json>'
//   input: { steps: [{ op, ... }] } — the last stdout line is the JSON result `{ failure, outputs }`.
const input = JSON.parse(process.argv[2] ?? '{}')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')

async function rows(sql, params = []) {
  const container = await di.createRequestContainer()
  return container.resolve('em').fork().execute(sql, params)
}

async function runStep(step) {
  switch (step.op) {
    case 'link': {
      const found = await rows(
        `select user_id, tenant_id, organization_id, last_signed_in_at, email_at_link from vereino_identity_links
          where provider = ? and subject = ?`,
        [step.provider, step.subject],
      )
      const row = found[0] ?? null
      return {
        count: found.length,
        userId: row?.user_id ?? null,
        tenantId: row?.tenant_id ?? null,
        organizationId: row?.organization_id ?? null,
        lastSignedInAt: row?.last_signed_in_at ? new Date(row.last_signed_in_at).toISOString() : null,
        emailStoredPlain:
          row?.email_at_link != null && step.email != null && String(row.email_at_link).includes(step.email),
        emailStored: row?.email_at_link != null,
      }
    }
    case 'userCount': {
      const [row] = await rows('select count(*)::int as count from users')
      return { count: row.count }
    }
    case 'clearPassword': {
      await rows('update users set password_hash = null where id = ?', [step.userId])
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
process.stdout.write(`\n${JSON.stringify({ failure, outputs })}\n`, () => process.exit(0))
