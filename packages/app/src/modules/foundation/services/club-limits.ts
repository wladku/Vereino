// Per-club limits applied in a transaction (many-clubs spec DD-M10, Q-M04; #633). The pure rules live in
// `lib/club-limits.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { foundationErrors } from '../api/errors'
import { tryLockClubImport } from '../data/queries'
import { clubImportLockKey } from '../lib/club-limits'

/**
 * Holds the club's import slot until the caller's transaction ends: one running import per club, across import kinds
 * (the people import commit and the bank statement import). Another import of the club answers 409 `import_running` at
 * once instead of waiting for the lock.
 */
export async function holdClubImportSlot(em: EntityManager, organizationId: string): Promise<void> {
  if (!(await tryLockClubImport(em, clubImportLockKey(organizationId)))) await foundationErrors.throw('import_running')
}
