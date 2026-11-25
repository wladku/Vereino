import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerClubDataContributor } from '@/modules/foundation'
import { TRAINING_CLUB_TABLES } from './lib/club-tables'
import { TRAINING_OUTLINE_TOPICS, createOutlineTopics } from './services/outline-topics'

/**
 * `trainingOutlineTopics` (training outlines spec DD-O06, #683): the outline topic of each session, which the PZPN
 * schedule export of `activities` reads with `hasRegistration`. The club data contributor names the module's tables for
 * `club_core export-club` and `delete-club` (many clubs spec DD-M09).
 */
export function register(container: AppContainer) {
  registerClubDataContributor(container, 'training', TRAINING_CLUB_TABLES)
  container.register({
    [TRAINING_OUTLINE_TOPICS]: asFunction(() => createOutlineTopics(container)).scoped(),
  })
}
