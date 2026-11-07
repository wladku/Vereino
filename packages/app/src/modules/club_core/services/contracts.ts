// The contracts read side (club spec DD-09, *Data Models* → `club_core_contracts`; #96), registered in DI as
// `clubCoreContracts`: the coach units report of `activities` reads the coach contracts that overlap a month, with
// their rates decrypted and the club's settlement model (R14). The contract commands use `liveContractsOf` and
// `partyName` here too. A person party is checked through the optional `people.personDirectory` (`people` requires
// `club_core`, so `club_core` imports nothing of it and resolves the service by name with `hasRegistration`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CalendarDate } from '@vereino/core'
import { Contract } from '../data/entities'
import { parseCoachTerms, type CoachSettlementModel, type CoachTerms, type ContractPartyType } from '../lib/contracts'
import { findInstitutions } from './directory'
import { readClubSettings } from './settings'

export type ContractScope = { tenantId: string; organizationId: string }

/** A coach contract as the report prices it: its period and rates in grosz. */
export type CoachContractEntry = {
  id: string
  personId: string
  validFrom: CalendarDate
  validTo: CalendarDate | null
  terms: CoachTerms
}

export type ClubCoreContracts = {
  /** The club's settlement model (`club_settings.coach_settlement_model`) and currency. */
  settlement(scope: ContractScope): Promise<{ model: CoachSettlementModel; currency: string }>
  /**
   * The live coach contracts of `personIds` whose period shares a day with `from`–`to` (both inclusive), oldest first,
   * by person id; a person without one is absent.
   */
  coachContracts(
    scope: ContractScope,
    personIds: readonly string[],
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<Map<string, CoachContractEntry[]>>
}

/** The DI token of `people`'s person directory, resolved only when registered. */
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'

/** The part of `people`'s person directory a contract needs. */
type PersonNames = {
  findPersons(
    scope: ContractScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, { firstName: string; lastName: string }>>
}

function personNames(container: AwilixContainer): PersonNames | null {
  return container.hasRegistration(PEOPLE_PERSON_DIRECTORY)
    ? container.resolve<PersonNames>(PEOPLE_PERSON_DIRECTORY)
    : null
}

/**
 * The names of the parties, by id: persons as "First Last", institutions by name. A party that is unknown or deleted
 * — or a person while `people` is not enabled — is absent.
 */
export async function partyNames(
  container: AwilixContainer,
  em: EntityManager,
  scope: ContractScope,
  parties: readonly { partyType: string; partyId: string }[],
): Promise<Map<string, string>> {
  const ids = (type: ContractPartyType) => parties.filter((row) => row.partyType === type).map((row) => row.partyId)
  const names = new Map<string, string>()
  const personIds = ids('person')
  const directory = personIds.length > 0 ? personNames(container) : null
  if (directory) {
    for (const [id, person] of await directory.findPersons(scope, personIds, em)) {
      names.set(id, `${person.firstName} ${person.lastName}`)
    }
  }
  for (const [id, institution] of await findInstitutions(em, scope, ids('institution'))) names.set(id, institution.name)
  return names
}

/** The live contracts of one kind for one party, oldest first, for the overlap check. */
export function liveContractsOf(
  em: EntityManager,
  scope: ContractScope,
  party: { partyType: string; partyId: string; kind: string },
): Promise<Pick<Contract, 'id' | 'validFrom' | 'validTo'>[]> {
  return em.find(
    Contract,
    { ...scope, ...party, deletedAt: null },
    { fields: ['id', 'validFrom', 'validTo'], orderBy: { validFrom: 'asc', id: 'asc' } },
  )
}

export async function coachContracts(
  em: EntityManager,
  scope: ContractScope,
  personIds: readonly string[],
  from: CalendarDate,
  to: CalendarDate,
): Promise<Map<string, CoachContractEntry[]>> {
  const unique = [...new Set(personIds)]
  const byPerson = new Map<string, CoachContractEntry[]>()
  if (unique.length === 0) return byPerson
  const rows = await findWithDecryption(
    em,
    Contract,
    {
      ...scope,
      kind: 'coach',
      partyType: 'person',
      partyId: { $in: unique },
      deletedAt: null,
      validFrom: { $lte: to },
      $or: [{ validTo: null }, { validTo: { $gte: from } }],
    },
    { orderBy: { validFrom: 'asc', id: 'asc' } },
    scope,
  )
  for (const row of rows) {
    const entry: CoachContractEntry = {
      id: row.id,
      personId: row.partyId,
      validFrom: row.validFrom,
      validTo: row.validTo ?? null,
      terms: parseCoachTerms(row.terms ?? null),
    }
    byPerson.set(row.partyId, [...(byPerson.get(row.partyId) ?? []), entry])
  }
  return byPerson
}

export function createClubCoreContracts(getEm: () => EntityManager): ClubCoreContracts {
  return {
    async settlement(scope) {
      const { values } = await readClubSettings(getEm().fork(), scope)
      return { model: values.coachSettlementModel, currency: values.currency }
    },
    coachContracts: (scope, personIds, from, to) => coachContracts(getEm().fork(), scope, personIds, from, to),
  }
}
