// The P-10 token-link probe (foundation spec TEST-F07, phase C step 1, #157): a QA-only process that boots the app the
// way the `mercato` CLI does, registers two probe token tables — one per use policy, declared with the shipped
// `scopedEntityColumns` and `tokenLinkColumns` of `@vereino/db` — creates them in the disposable test database, and runs
// a script of steps against the real `createTokenLinkService` (resolved from the `foundationTokenLinks` DI service).
// The shipped modules contain no probe table; the first real table arrives with the declaration link (#105).
//
// Usage (cwd = packages/app): node .ai/qa/tests/_fixtures/token-link-probe/probe.mjs '<json>'
//   input: { tenantId, organizationId, steps: [{ op, ... }] } — the last stdout line is the JSON result.
// Step outputs carry ids, states, counts and codes only. The raw tokens and their hashes appear once, in the result's
// `secrets` field, so the test can prove that no other output, log line or event carries them.
import { EntitySchema } from '@mikro-orm/core'
import { scopedEntityColumns, tokenLinkColumns } from '@vereino/db'

const input = JSON.parse(process.argv[2] ?? '{}')

const { bootstrapFromAppRoot } = await import('@open-mercato/shared/lib/bootstrap/dynamicLoader')
await bootstrapFromAppRoot(process.cwd())
const di = await import('@open-mercato/shared/lib/di/container')
const mikro = await import('@open-mercato/shared/lib/db/mikro')
const { hashAuthToken } = await import('@open-mercato/core/modules/auth/lib/tokenHash')

// --- the probe tables ----------------------------------------------------------------------------------------------

function probeSchema(name, tableName, use) {
  const base = scopedEntityColumns()
  return new EntitySchema({
    name,
    tableName,
    properties: {
      id: { ...base.id, primary: true },
      ...base.properties,
      // A schema without a class has no `ScopedEntityBase` field initializer for the first `updated_at`.
      updatedAt: { ...base.properties.updatedAt, onCreate: () => new Date() },
      ...tokenLinkColumns({ use }),
      subjectId: { name: 'subject_id', type: 'uuid' },
      targets: { name: 'targets', type: 'json' },
    },
  })
}

const tables = {
  single: { schema: probeSchema('QaProbeSingleLink', 'qa_probe_single_links', 'single'), use: 'single' },
  until_expiry: {
    schema: probeSchema('QaProbeUntilExpiryLink', 'qa_probe_until_expiry_links', 'until_expiry'),
    use: 'until_expiry',
  },
}
// Before the first `getOrm()`: the ORM discovers the probe tables with the app's entities.
mikro.registerOrmEntities([...mikro.getOrmEntities(), tables.single.schema, tables.until_expiry.schema])

const useColumns = {
  single: 'used_at timestamptz null',
  until_expiry: 'used_count integer not null default 0, last_used_at timestamptz null',
}

async function newContainer() {
  return di.createRequestContainer()
}

async function rows(sql, params = []) {
  const container = await newContainer()
  return container.resolve('em').fork().execute(sql, params)
}

for (const [use, table] of Object.entries(tables)) {
  await rows(
    `create table if not exists ${table.schema.meta.tableName} (
       id uuid primary key default gen_random_uuid(), tenant_id uuid not null, organization_id uuid not null,
       created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz null,
       token_hash text not null unique, expires_at timestamptz not null, ${useColumns[use]},
       subject_id uuid not null, targets jsonb not null)`,
  )
}

// --- recorded events -----------------------------------------------------------------------------------------------

const events = []
const BUS_KEY = '__openMercatoGlobalEventBus__'

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

let currentBus = recording(globalThis[BUS_KEY])
Object.defineProperty(globalThis, BUS_KEY, {
  configurable: true,
  get: () => currentBus,
  set: (bus) => {
    currentBus = recording(bus)
  },
})

// --- helpers -------------------------------------------------------------------------------------------------------

const scope = { tenantId: input.tenantId, organizationId: input.organizationId }
const secrets = []
const tokens = new Map()

function codedError(error) {
  return {
    status: typeof error?.status === 'number' ? error.status : 500,
    code: error?.body?.code ?? null,
    message: error?.body?.error ?? (error instanceof Error ? error.message.slice(0, 200) : String(error)),
  }
}

async function serviceFor(container, use, ttlMs = 3_600_000) {
  const { createTokenLinkService } = container.resolve('foundationTokenLinks')
  return createTokenLinkService(tables[use].schema, { use, ttlMs })
}

/** The token named `ref`, a well-formed token nobody issued (`unknown`) or a malformed one (`malformed`). */
function tokenOf(ref) {
  if (ref === 'unknown') return 'f'.repeat(64)
  if (ref === 'malformed') return 'not-a-token'
  const entry = tokens.get(ref)
  if (!entry) throw new Error(`[internal] no token named ${String(ref)}`)
  return entry.rawToken
}

function linkUseOf(ref) {
  return tokens.get(ref)?.use ?? 'single'
}

function viewOf(found) {
  if (!found) return { found: null }
  return {
    found: {
      id: found.link.id,
      tenantId: found.tenantId,
      organizationId: found.organizationId,
      subjectId: found.link.subjectId,
      targets: found.link.targets,
      usedCount: found.link.usedCount ?? null,
      used: Boolean(found.link.usedAt),
    },
  }
}

async function storedRow(ref) {
  const entry = tokens.get(ref)
  const [row] = await rows(
    `select id, tenant_id, organization_id, token_hash, expires_at, ${
      entry.use === 'single' ? 'used_at' : 'used_count, last_used_at'
    } from ${tables[entry.use].schema.meta.tableName} where id = ?`,
    [entry.id],
  )
  return row
}

// --- steps ---------------------------------------------------------------------------------------------------------

async function runStep(step) {
  switch (step.op) {
    case 'issue': {
      const container = await newContainer()
      const service = await serviceFor(container, step.use, step.ttlMs)
      const em = container.resolve('em').fork()
      try {
        const issued = await em.transactional((tx) =>
          service.issue(tx, { subjectId: step.subjectId, targets: step.targets }, scope, {
            ...(step.expiresInMs ? { expiresAt: new Date(Date.now() + step.expiresInMs) } : {}),
          }),
        )
        tokens.set(step.as, { rawToken: issued.rawToken, id: issued.link.id, use: step.use })
        secrets.push(issued.rawToken, hashAuthToken(issued.rawToken))
        return { id: issued.link.id, rawTokenLength: issued.rawToken.length }
      } catch (error) {
        return { error: codedError(error) }
      }
    }
    case 'stored': {
      // What the database holds: the hash of the raw token, never the raw token itself.
      const entry = tokens.get(step.token)
      const row = await storedRow(step.token)
      return {
        tenantId: row.tenant_id,
        organizationId: row.organization_id,
        hashIsHmacOfRaw: row.token_hash === hashAuthToken(entry.rawToken),
        rowContainsRaw: JSON.stringify(row).includes(entry.rawToken),
        usedAt: row.used_at ?? null,
        usedCount: row.used_count === undefined ? null : Number(row.used_count),
        lastUsedAt: row.last_used_at ?? null,
      }
    }
    case 'peek': {
      const container = await newContainer()
      const service = await serviceFor(container, step.use ?? linkUseOf(step.token))
      try {
        const found = await service.peek(container.resolve('em').fork(), tokenOf(step.token), {
          ...(step.scope ? { scope: step.scope } : {}),
        })
        return viewOf(found)
      } catch (error) {
        return { error: codedError(error) }
      }
    }
    case 'redeem': {
      // One redemption per transaction, `times` at once (concurrent consumers of one link).
      const runOnce = async () => {
        const container = await newContainer()
        const service = await serviceFor(container, step.use ?? linkUseOf(step.token))
        const em = container.resolve('em').fork()
        try {
          const found = await em.transactional(async (tx) => {
            const redeemed = await service.redeem(tx, tokenOf(step.token), {
              ...(step.scope ? { scope: step.scope } : {}),
            })
            if (step.rollback) throw Object.assign(new Error('probe rollback'), { probeRollback: true, redeemed })
            return redeemed
          })
          return viewOf(found)
        } catch (error) {
          if (error?.probeRollback) return { rolledBack: true, ...viewOf(error.redeemed) }
          return { error: codedError(error) }
        }
      }
      return { results: await Promise.all(Array.from({ length: step.times ?? 1 }, runOnce)) }
    }
    case 'expire': {
      // Time travel for one link: its expiry lies one second in the past.
      const entry = tokens.get(step.token)
      await rows(
        `update ${tables[entry.use].schema.meta.tableName} set expires_at = now() - interval '1 second' where id = ?`,
        [entry.id],
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

const result = { failure, outputs, events, secrets }
process.stdout.write(`\n${JSON.stringify(result)}\n`, () => process.exit(0))
