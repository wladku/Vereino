// `trainingOutlineTopics` (training outlines spec DD-O06; #683): the topic of each session's outline, for the PZPN
// schedule export of `activities` (the "name / general goal" column, E24-S04 #684), which resolves the token with
// `hasRegistration`. Read only, in the caller's tenant and organization; the export already checked the team's scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { TrainingOutlineTopics } from '../../activities/services/pzpn-export'
import { Outline } from '../data/entities'

/** The token `activities` reads (`TRAINING_OUTLINE_TOPICS` in `activities/services/pzpn-export.ts`). */
export const TRAINING_OUTLINE_TOPICS = 'trainingOutlineTopics'

export function createOutlineTopics(container: AwilixContainer): TrainingOutlineTopics {
  return {
    async topicsFor(scope, occurrenceIds) {
      const unique = [...new Set(occurrenceIds)]
      if (unique.length === 0) return new Map()
      const em = container.resolve<EntityManager>('em').fork()
      const rows = await em.find(
        Outline,
        { ...scope, occurrenceId: { $in: unique }, deletedAt: null },
        { fields: ['id', 'occurrenceId', 'topic'] },
      )
      return new Map(rows.flatMap((row) => (row.occurrenceId ? [[row.occurrenceId, row.topic] as const] : [])))
    },
  }
}
