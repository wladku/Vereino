// The club side of the library's erasures (training outlines spec *Events* → name consent withdrawn, anonymisation,
// club offboarding; REQ-O14, REQ-O16; E24-S05, #685): which library entries a club's outlines are published as. Kept out
// of the command files so the departure and club-deletion contributors that `di.ts` registers can use it.
import type { EntityManager } from '@mikro-orm/postgresql'
import { Outline } from '../data/entities'
import type { TrainingScope } from './directory'
import type { TrainingLibrary } from './library'

/** Strips the person's name from the entries of the outlines they wrote (live or deleted) and from their copies. */
export async function stripAuthorIn(
  library: TrainingLibrary,
  em: EntityManager,
  club: TrainingScope,
  personId: string,
): Promise<number> {
  const outlines = await em.find(
    Outline,
    { ...club, authorPersonId: personId, publishedEntryId: { $ne: null } },
    { fields: ['id', 'publishedEntryId'] },
  )
  const entryIds = outlines.flatMap((row) => (row.publishedEntryId ? [row.publishedEntryId] : []))
  return library.stripAuthorName(em, entryIds)
}
