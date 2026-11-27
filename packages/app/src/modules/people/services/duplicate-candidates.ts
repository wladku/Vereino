// `people.duplicateCandidates` (section sign-up form spec DD-J11, Q-J05): the possible duplicates of an applicant among
// the live persons of one club, for `enrolment`, which resolves it with `hasRegistration` and stores the result as
// scalar ids. Names, e-mail and phone are encrypted without a lookup hash (no new hash column, DD-J11), so this service
// narrows by the plain `birth_date` (name match) or by adulthood and a present e-mail or phone (contact match), reads
// those rows decrypted and leaves the comparison to `lib/duplicate-candidates.ts`. It returns ids and reasons only.
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { Person } from '../data/entities'
import {
  adultBirthDateCutoff,
  matchDuplicateCandidates,
  normalizeEmail,
  normalizePhone,
  type DuplicateCandidate,
  type DuplicateCandidateRow,
  type DuplicateQuery,
} from '../lib/duplicate-candidates'
import { clubToday, type ClubScope } from './club-clock'

export type { DuplicateCandidate, DuplicateQuery, DuplicateReason } from '../lib/duplicate-candidates'

/** DI token of the optional contract; consumers check it with `container.hasRegistration`. */
export const PEOPLE_DUPLICATE_CANDIDATES = 'people.duplicateCandidates' as const

/** The most adult persons with an e-mail or phone read for one contact match; a larger club is logged. */
export const CONTACT_CANDIDATE_CAP = 5000

export type DuplicateCandidatesService = {
  /**
   * The live (not deleted, not anonymised) persons of the organization that may be the applicant, one entry per person
   * and reason, ordered by reason (`name_birth_date`, `email`, `phone`) then person id. `today` (`YYYY-MM-DD`) defaults
   * to the club's calendar date; `em` is the caller's EntityManager when the read must run in its transaction.
   */
  candidates(
    scope: ClubScope,
    query: DuplicateQuery,
    options?: { today?: string; em?: EntityManager },
  ): Promise<DuplicateCandidate[]>
}

const FIELDS = ['id', 'firstName', 'lastName', 'birthDate', 'email', 'phone'] as const

const logger = createLogger('people').child({ component: 'duplicate-candidates' })

export function createDuplicateCandidates(container: AwilixContainer): DuplicateCandidatesService {
  return {
    async candidates(scope, query, options = {}) {
      const scoped = { tenantId: scope.tenantId, organizationId: scope.organizationId }
      const today = options.today ?? (await clubToday(container, scoped))
      const em = options.em ?? container.resolve<EntityManager>('em').fork()
      const live = { ...scoped, deletedAt: null, anonymizedAt: null }
      const toRow = (person: Person): DuplicateCandidateRow => ({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        birthDate: person.birthDate ?? null,
        email: person.email ?? null,
        phone: person.phone ?? null,
      })
      const rows: DuplicateCandidateRow[] = []

      if (query.birthDate) {
        const byBirthDate = await findWithDecryption(
          em,
          Person,
          { ...live, birthDate: query.birthDate },
          { fields: [...FIELDS] },
          scoped,
        )
        rows.push(...byBirthDate.map(toRow))
      }

      const contactFilters = [
        ...(normalizeEmail(query.email) !== '' ? [{ email: { $ne: null } }] : []),
        ...(normalizePhone(query.phone) !== '' ? [{ phone: { $ne: null } }] : []),
      ]
      if (contactFilters.length > 0) {
        const adults = await findWithDecryption(
          em,
          Person,
          {
            ...live,
            $and: [
              { $or: [{ birthDate: null }, { birthDate: { $lte: adultBirthDateCutoff(today) } }] },
              { $or: contactFilters },
            ],
          },
          { fields: [...FIELDS], orderBy: { id: 'asc' }, limit: CONTACT_CANDIDATE_CAP },
          scoped,
        )
        if (adults.length >= CONTACT_CANDIDATE_CAP) {
          logger.warn('duplicate contact match read the cap of adult persons; later persons were not compared', {
            organizationId: scoped.organizationId,
            cap: CONTACT_CANDIDATE_CAP,
          })
        }
        rows.push(...adults.map(toRow))
      }

      return matchDuplicateCandidates(query, rows, today)
    },
  }
}
