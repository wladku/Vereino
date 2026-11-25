// The `training` departure contributor (training outlines spec *Events* → person departure / anonymisation, REQ-O14,
// REQ-O16; E24-S05, #685): `people` declares the contract (`people/services/departure.ts`) and reads it with
// `hasRegistration`; `training` registers it in `di.ts` under `people.departure.training`. A departure ends nothing in
// `training` (an outline stays with the club). `erase` (S9.6) runs in the anonymisation's transaction: the person's
// name leaves every library entry of the outlines they wrote (and the copies crediting them), and every rating, use
// and report of the person's rater keys (all secret versions) is deleted, with the entries' aggregates recomputed.
// The outlines themselves are coaching content and stay with the club, their author id pointing at the anonymised
// person.
import type { AwilixContainer } from 'awilix'
import type { DepartureContributor } from '../../people/services/departure'
import { Outline } from '../data/entities'
import { TRAINING_LIBRARY, type TrainingLibrary } from './library'
import { stripAuthorIn } from './library-club'

/** The token `people` reads (`departureContributorToken('training')` in `people/services/departure.ts`). */
export const TRAINING_DEPARTURE_CONTRIBUTOR = 'people.departure.training'

export function createDepartureContribution(container: AwilixContainer): DepartureContributor {
  const library = () => container.resolve<TrainingLibrary>(TRAINING_LIBRARY)
  return {
    async preview() {
      return { items: [], warnings: [], blockers: [] }
    },
    async apply() {
      return { snapshot: null, changes: [] }
    },
    async undo() {
      return []
    },
    async afterCommit() {},
    // A mistaken person wrote no outline, ever (*Mistaken person*).
    async hasHistory(em, subject) {
      return (
        (await em.count(Outline, {
          tenantId: subject.tenantId,
          organizationId: subject.organizationId,
          authorPersonId: subject.personId,
        })) > 0
      )
    },
    async erase(em, subject) {
      const service = library()
      if (!service.config()) return { touched: [], kept: [] }
      const club = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const credits = await stripAuthorIn(service, em, club, subject.personId)
      const raterRows = await service.eraseRater(em, club, subject.personId)
      return {
        touched: [
          { table: 'training_library_entries', rows: credits },
          { table: 'training_library_ratings+uses+reports', rows: raterRows },
        ].filter((entry) => entry.rows > 0),
        kept: [],
      }
    },
  }
}
