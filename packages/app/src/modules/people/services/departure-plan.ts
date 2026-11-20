// The plan of a departure (people life-cycle spec REQ-L03, B-10 `?tab=leaving`; phase L4, #306): what `people` and
// every registered contributor would end, the blockers, the payer hand-overs and the persons the preview suggests.
// The preview route returns it; `people.persons.depart` rebuilds it inside its transaction and compares it with the
// preview token, so a confirmed departure is exactly the one previewed (409 `departure_preview_stale` otherwise).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Validity, type CalendarDate } from '@vereino/core'
import { accountView } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import {
  accountClosingDay,
  activeAfter,
  departureBlockers,
  endAction,
  payerChoices,
  suggestedPersons,
  type DepartureGuardianship,
  type DeparturePersonFacts,
  type PayerChoice,
  type SuggestedPerson,
} from '../lib/departure-rules'
import { listDisplayName } from '../lib/person-list-filters'
import type { ClubScope } from './club-clock'
import {
  departureContributors,
  type DepartureHandOverNeed,
  type DepartureItem,
  type DepartureNotice,
  type DepartureSubject,
} from './departure'

/** A blocker as the preview shows it: `people`'s own (DD-L04) or a contributor's notice. */
export type DeparturePlanBlocker = {
  module: string
  code: string
  personId: string
  wardPersonId?: string
  leftOn?: CalendarDate
  recordId?: string
  params?: Record<string, string | number | null>
}

export type DeparturePlanPerson = {
  id: string
  name: string
  leftOn: CalendarDate | null
  ends: DepartureItem[]
  warnings: DepartureNotice[]
  blockers: DeparturePlanBlocker[]
  choicesNeeded: PayerChoice[]
  /** The groups of a leaving coach that need a hand-over choice (phase L5, #307). */
  handOvers: DepartureHandOverNeed[]
}

export type DeparturePlan = {
  lastDay: CalendarDate
  persons: DeparturePlanPerson[]
  suggestedPersons: Array<SuggestedPerson & { name: string }>
  /** Display names of the other persons the plan names (wards, guardians, payer candidates). */
  names: Record<string, string>
  blocked: boolean
  /** `people`'s rows the departure changes (the command writes them). */
  roleAssignments: RoleAssignment[]
  guardianships: Guardianship[]
}

const PEOPLE_MODULE = 'people'

/** Tuples in a fixed order: the rows' read order (no `ORDER BY`, rows updated since) must not make a token stale. */
function sortedTuples(tuples: unknown[][]): unknown[][] {
  return tuples
    .map((tuple) => ({ tuple, key: JSON.stringify(tuple) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.tuple)
}

/** The plan's content the preview token binds: ids, actions, blockers and choices — no names, in a fixed order. */
export function planBindingContent(plan: DeparturePlan): unknown {
  return plan.persons.map((person) => ({
    id: person.id,
    ends: sortedTuples(person.ends.map((item) => [item.module, item.kind, item.recordId, item.action, item.until])),
    blockers: sortedTuples(
      person.blockers.map((blocker) => [blocker.module, blocker.code, blocker.wardPersonId ?? blocker.recordId]),
    ),
    choices: sortedTuples(
      person.choicesNeeded.map((choice) => [choice.wardPersonId, choice.candidateGuardianPersonIds]),
    ),
    // The groups only: a session the daily generator adds after the preview does not make it stale.
    handOvers: [...new Set(person.handOvers.map((need) => need.groupId))].sort(),
  }))
}

function guardianshipFacts(row: Guardianship): DepartureGuardianship {
  return {
    id: row.id,
    guardianPersonId: row.guardianPersonId,
    wardPersonId: row.wardPersonId,
    isPrimaryPayer: row.isPrimaryPayer,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

/** The guardianships of the leaving persons and of everyone linked to them (the other guardians of their wards). */
async function relatedGuardianships(em: EntityManager, scope: ClubScope, personIds: readonly string[]) {
  const where = { ...scope, deletedAt: null }
  const direct = await em.find(Guardianship, {
    ...where,
    $or: [{ guardianPersonId: { $in: [...personIds] } }, { wardPersonId: { $in: [...personIds] } }],
  })
  if (direct.length === 0) return []
  const linked = [...new Set(direct.flatMap((row) => [row.guardianPersonId, row.wardPersonId]))]
  return em.find(Guardianship, {
    ...where,
    $or: [{ guardianPersonId: { $in: linked } }, { wardPersonId: { $in: linked } }],
  })
}

/** Persons with an active `club_admin` role today, and those among them whose account is active. */
async function clubAdmins(em: EntityManager, container: AwilixContainer, scope: ClubScope, today: CalendarDate) {
  const rows = await em.find(
    RoleAssignment,
    { ...scope, role: 'club_admin', deletedAt: null },
    { fields: ['id', 'personId', 'validFrom', 'validTo'] },
  )
  const adminIds = [
    ...new Set(
      rows
        .filter((row) => Validity.isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today))
        .map((row) => row.personId),
    ),
  ]
  const persons =
    adminIds.length > 0
      ? await em.find(Person, { ...scope, id: { $in: adminIds }, deletedAt: null }, { fields: ['id', 'userId'] })
      : []
  const active: string[] = []
  for (const person of persons) {
    if ((await accountView(container, scope, person.userId)).state === 'active') active.push(person.id)
  }
  return { clubAdminIds: adminIds, activeAccountAdminIds: active }
}

/**
 * Builds the plan of `personIds` leaving with `lastDay`, reading with `em` (inside the command's transaction when it
 * applies). Null when a person is not a live person of the club (the caller answers 404).
 */
export async function buildDeparturePlan(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  input: { personIds: readonly string[]; lastDay: CalendarDate; today: CalendarDate },
): Promise<DeparturePlan | null> {
  const personIds = [...new Set(input.personIds)].sort()
  const { lastDay } = input
  const leaving = await findWithDecryption(
    em,
    Person,
    { ...scope, id: { $in: personIds }, deletedAt: null },
    { fields: ['id', 'firstName', 'lastName', 'birthDate', 'leftOn', 'userId'] },
    scope,
  )
  if (leaving.length !== personIds.length) return null

  const guardianshipRows = await relatedGuardianships(em, scope, personIds)
  const otherIds = [...new Set(guardianshipRows.flatMap((row) => [row.guardianPersonId, row.wardPersonId]))].filter(
    (id) => !personIds.includes(id),
  )
  const others =
    otherIds.length > 0
      ? await findWithDecryption(
          em,
          Person,
          { ...scope, id: { $in: otherIds }, deletedAt: null },
          { fields: ['id', 'firstName', 'lastName', 'birthDate', 'leftOn'] },
          scope,
        )
      : []
  const facts = new Map<string, DeparturePersonFacts>(
    [...leaving, ...others].map((person) => [
      person.id,
      { id: person.id, birthDate: person.birthDate ?? null, leftOn: person.leftOn ?? null },
    ]),
  )
  const names: Record<string, string> = {}
  for (const person of [...leaving, ...others]) names[person.id] = listDisplayName(person)
  const liveGuardianships = guardianshipRows.filter(
    (row) => facts.has(row.guardianPersonId) && facts.has(row.wardPersonId),
  )
  const guardianshipFactsList = liveGuardianships.map(guardianshipFacts)

  const roleAssignments = (
    await em.find(RoleAssignment, { ...scope, personId: { $in: personIds }, deletedAt: null })
  ).filter((row) => activeAfter({ validFrom: row.validFrom, validTo: row.validTo ?? null }, lastDay))
  const endedGuardianships = liveGuardianships.filter(
    (row) =>
      (personIds.includes(row.guardianPersonId) || personIds.includes(row.wardPersonId)) &&
      activeAfter({ validFrom: row.validFrom, validTo: row.validTo ?? null }, lastDay),
  )

  const admins = await clubAdmins(em, container, scope, input.today)
  const ownBlockers = departureBlockers({
    leavingIds: personIds,
    persons: facts,
    guardianships: guardianshipFactsList,
    lastDay,
    ...admins,
  })
  const choices = payerChoices({ leavingIds: personIds, guardianships: guardianshipFactsList, lastDay })
  const suggested = suggestedPersons({ leavingIds: personIds, guardianships: guardianshipFactsList, lastDay })

  const subject: DepartureSubject = { ...scope, personIds, lastDay }
  const contributed = {
    items: [] as DepartureItem[],
    warnings: [] as DepartureNotice[],
    blockers: [] as DepartureNotice[],
    handOvers: [] as DepartureHandOverNeed[],
  }
  // One contributor at a time: `em` may be the command's transaction, a single connection.
  for (const { contributor } of departureContributors(container)) {
    const part = await contributor.preview(em, subject)
    contributed.items.push(...part.items)
    contributed.warnings.push(...part.warnings)
    contributed.blockers.push(...part.blockers)
    contributed.handOvers.push(...(part.handOvers ?? []))
  }

  const persons: DeparturePlanPerson[] = leaving
    .map((person) => {
      const ends: DepartureItem[] = [
        ...roleAssignments
          .filter((row) => row.personId === person.id)
          .map((row) => {
            const period = { validFrom: row.validFrom, validTo: row.validTo ?? null }
            const action = endAction(period, lastDay)
            return {
              module: PEOPLE_MODULE,
              kind: 'role_assignment',
              recordId: row.id,
              personId: person.id,
              action,
              until: action === 'end' ? lastDay : null,
              label: { role: row.role, sectionId: row.sectionId ?? null, placeId: row.placeId ?? null },
            }
          }),
        ...endedGuardianships
          .filter((row) => row.guardianPersonId === person.id || row.wardPersonId === person.id)
          .map((row) => {
            const action = endAction({ validFrom: row.validFrom, validTo: row.validTo ?? null }, lastDay)
            const side = row.guardianPersonId === person.id ? 'guardian' : 'ward'
            return {
              module: PEOPLE_MODULE,
              kind: 'guardianship',
              recordId: row.id,
              personId: person.id,
              action,
              until: action === 'end' ? lastDay : null,
              label: { side, otherPersonId: side === 'guardian' ? row.wardPersonId : row.guardianPersonId },
            }
          }),
        ...contributed.items.filter((item) => item.personId === person.id),
      ]
      if (person.userId) {
        ends.push({
          module: PEOPLE_MODULE,
          kind: 'account',
          recordId: person.id,
          personId: person.id,
          action: 'end',
          until: accountClosingDay(lastDay),
          label: {},
        })
      }
      const blockers: DeparturePlanBlocker[] = [
        ...ownBlockers
          .filter((blocker) => blocker.personId === person.id)
          .map((blocker) => ({ module: PEOPLE_MODULE, ...blocker })),
        ...contributed.blockers.filter((blocker) => blocker.personId === person.id),
      ]
      return {
        id: person.id,
        name: names[person.id],
        leftOn: person.leftOn ?? null,
        ends,
        warnings: contributed.warnings.filter((warning) => warning.personId === person.id),
        blockers,
        choicesNeeded: choices.filter((choice) => choice.personId === person.id),
        handOvers: contributed.handOvers.filter((need) => need.personId === person.id),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    lastDay,
    persons,
    suggestedPersons: suggested.map((row) => ({ ...row, name: names[row.personId] ?? '' })),
    names,
    blocked: persons.some((person) => person.blockers.length > 0),
    roleAssignments,
    guardianships: endedGuardianships,
  }
}
