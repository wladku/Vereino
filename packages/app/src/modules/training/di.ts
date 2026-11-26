import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerClubDataContributor, registerClubDeleteBeyondTenant } from '@/modules/foundation'
import { TRAINING_CLUB_TABLES } from './lib/club-tables'
import { TRAINING_DEPARTURE_CONTRIBUTOR, createDepartureContribution } from './services/departure-contribution'
import { TRAINING_LIBRARY, createTrainingLibrary, type TrainingLibrary } from './services/library'
import { TRAINING_OUTLINE_TOPICS, createOutlineTopics } from './services/outline-topics'

/**
 * `trainingOutlineTopics` (training outlines spec DD-O06, #683): the outline topic of each session, which the PZPN
 * schedule export of `activities` reads with `hasRegistration`. The club data contributor names the module's tables for
 * `club_core export-club` and `delete-club` (many clubs spec DD-M09). Phase 4 (#685): `trainingLibrary`, the only code
 * that reads or writes the library tenant (DD-O10); the departure contributor `people.departure.training` (erasure of
 * the person's name and rater rows in the library); and the club deletion's part outside the club's tenant (the club's
 * library entries and its coaches' ratings, uses and reports; many-clubs BR-M4, Q-O08).
 */
export function register(container: AppContainer) {
  registerClubDataContributor(container, 'training', TRAINING_CLUB_TABLES)
  container.register({
    [TRAINING_OUTLINE_TOPICS]: asFunction(() => createOutlineTopics(container)).scoped(),
    [TRAINING_LIBRARY]: asFunction(() => createTrainingLibrary(container)).scoped(),
    [TRAINING_DEPARTURE_CONTRIBUTOR]: asFunction(() => createDepartureContribution(container)).scoped(),
  })
  const library = () => container.resolve<TrainingLibrary>(TRAINING_LIBRARY)
  registerClubDeleteBeyondTenant(container, {
    module: 'training',
    count: (em, scope) => library().countClub(em, scope),
    async delete(em, scope) {
      const service = library()
      if (!service.config()) return { tables: [] }
      const { tables, images } = await service.eraseClub(em, scope)
      return {
        tables,
        afterCommit: async () => {
          for (const [entryId, ids] of images) await service.releaseImages(entryId, ids)
        },
      }
    },
  })
}
