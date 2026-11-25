// Operator commands of `training` (`yarn mercato training <command>`; training outlines spec DD-O10, DD-O14; E24-S05,
// #685). Shell only; each prints one JSON line.
// - `training library-init`: creates the instance's library tenant (idempotent; prints the ids for the configuration).
// - `training library-moderate list`: the entries hidden after reports or reported at all, most reported first.
// - `training library-moderate restore --entry <id>`: lists a hidden entry again (its reports are settled).
// - `training library-moderate remove --entry <id>`: removes an entry from the library for good.
import { parseArgs } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { TRAINING_LIBRARY, type TrainingLibrary } from './services/library'
import { initLibraryTenant } from './services/library-init'

const MODERATE_USAGE = 'Usage: mercato training library-moderate <list | restore --entry <id> | remove --entry <id>>'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A usage error: the `mercato` runner exits 1 only on a thrown error (lesson `module-cli-exit-code-needs-a-thrown-error`). */
function fail(message: string): never {
  process.stderr.write(`${message}\n${MODERATE_USAGE}\n`)
  throw new Error('[internal] training library-moderate: invalid options')
}

const libraryInit: ModuleCli = {
  command: 'library-init',
  async run() {
    const container = await createRequestContainer()
    const result = await initLibraryTenant(container)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const libraryModerate: ModuleCli = {
  command: 'library-moderate',
  async run(argv) {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { entry: { type: 'string' } },
      strict: false,
      allowPositionals: true,
    })
    const action = positionals[0]
    const entry = typeof values.entry === 'string' ? values.entry : undefined
    const container = await createRequestContainer()
    const library = container.resolve<TrainingLibrary>(TRAINING_LIBRARY)
    if (!library.config()) fail('The library is not configured (VEREINO_LIBRARY_*)')
    const em = container.resolve<EntityManager>('em').fork()
    if (action === 'list') {
      const rows = await library.moderation(em)
      const entries = rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        status: row.status,
        visibility: row.visibility,
        reportCount: row.reportCount,
        publishedAt: row.publishedAt.toISOString(),
      }))
      process.stdout.write(`${JSON.stringify({ entries })}\n`)
      return
    }
    if (action === 'restore' || action === 'remove') {
      if (!entry || !UUID.test(entry)) fail('--entry must be an entry id')
      const row = await em.transactional((tx) => library.moderate(tx, entry, action))
      if (!row) fail(`Unknown entry ${entry}`)
      process.stdout.write(`${JSON.stringify({ id: row.id, status: row.status, reportCount: row.reportCount })}\n`)
      return
    }
    fail(action === undefined ? 'Missing action' : `Unknown action ${action}`)
  },
}

const commands: ModuleCli[] = [libraryInit, libraryModerate]

export default commands
