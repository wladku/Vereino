// The departure contributor contract (people life-cycle spec DD-L03, *API* row `DepartureContributor`, *Proposed
// Solution* → *Leaving*; phase L4, #306). `people` ends what it owns (role assignments, guardianships, `left_on`);
// every other module that holds a person's part in the club registers an optional contributor under
// `people.departure.<module>`, which `people` reads with `hasRegistration` — the direction of
// `groups.membershipContribution`, so `people` never imports those modules. Contributors read and write with the
// caller's EntityManager, so a departure (and its undo) is one transaction; their side effects run after the commit
// through `afterCommit`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import type { ErasurePart } from '../lib/erasure-rules'

export type { ErasureKept, ErasurePart, ErasureTouched } from '../lib/erasure-rules'

/** The modules that may contribute, in the order their parts are applied and shown. */
export const DEPARTURE_CONTRIBUTOR_MODULES = [
  'groups',
  'activities',
  'payments',
  'club_core',
  'facilities',
  'training',
] as const
export type DepartureContributorModule = (typeof DEPARTURE_CONTRIBUTOR_MODULES)[number]

/** DI token of a module's contributor, e.g. `people.departure.groups`. */
export function departureContributorToken(module: DepartureContributorModule): string {
  return `people.departure.${module}`
}

/** The persons who leave, the last day and the trusted scope (never from a payload). */
export type DepartureSubject = {
  tenantId: string
  organizationId: string
  personIds: readonly string[]
  lastDay: CalendarDate
}

/**
 * One record the departure ends: `end` sets its last day to `lastDay`, `remove` soft-deletes a record that would only
 * start after it. `label` carries display values (a group's name, a role), never personal data of other persons.
 */
export type DepartureItem = {
  module: string
  kind: string
  recordId: string
  personId: string
  action: 'end' | 'remove'
  until: CalendarDate | null
  label: Record<string, string | null>
}

/** A warning or a blocker a contributor reports for one person (e.g. `payments`: cash held, open charges). */
export type DepartureNotice = {
  module: string
  code: string
  personId: string
  recordId?: string
  params?: Record<string, string | number | null>
}

/**
 * A group whose future sessions or default-coach activities a leaving coach leads (phase L5, #307; *Hand-over
 * choice*): the departure needs a choice per group — hand over to a coach, or leave unassigned. Counts and names only.
 */
export type DepartureHandOverNeed = {
  module: string
  personId: string
  groupId: string
  groupName: string | null
  sessions: number
  activities: number
}

export type DeparturePreviewPart = {
  items: DepartureItem[]
  warnings: DepartureNotice[]
  blockers: DepartureNotice[]
  /** The hand-over choices the departure needs (`activities`); absent = none. */
  handOvers?: DepartureHandOverNeed[]
}

/** One hand-over choice: the group's sessions go to `toPersonId`, or stay without a coach when it is null. */
export type DepartureHandOverChoice = { groupId: string; toPersonId: string | null }

/** What `people` passes to every contributor's `apply`: the choices and who decided (the actor's own person). */
export type DepartureChoices = {
  handOver: readonly DepartureHandOverChoice[]
  decidedByPersonId: string | null
  actingRole: string
}

/**
 * What a contributor changed, for its own `afterCommit` (events, cache, search). `refs` carries ids a hard-deleted row
 * no longer gives after the commit (e.g. a removed place maintainer's place and person).
 */
export type DepartureChange = {
  kind: string
  recordId: string
  action: 'updated' | 'deleted' | 'created'
  refs?: Record<string, string>
}

export type DepartureApplyResult = { snapshot: unknown; changes: DepartureChange[] }

export type DepartureCommitContext = { container: AwilixContainer; tenantId: string; organizationId: string }

export type DepartureContributor = {
  /** What the departure would end, warn about or be blocked by. Read only. */
  preview(em: EntityManager, subject: DepartureSubject): Promise<DeparturePreviewPart>
  /** Ends the records in the caller's transaction; throws to roll the whole departure back. */
  apply(em: EntityManager, subject: DepartureSubject, choices: DepartureChoices): Promise<DepartureApplyResult>
  /** Restores from the snapshot `apply` returned, in the caller's transaction (until the last day only). */
  undo(em: EntityManager, subject: DepartureSubject, snapshot: unknown): Promise<DepartureChange[]>
  /** After the commit: the module's events, cache invalidation and reindex. A failure is logged, never rolled back. */
  afterCommit(changes: readonly DepartureChange[], ctx: DepartureCommitContext, undo: boolean): Promise<void>
  /** Whether the person has any record in the module, ever (a mistaken person has none; phase L6). */
  hasHistory(
    em: EntityManager,
    subject: { tenantId: string; organizationId: string; personId: string },
  ): Promise<boolean>
  /**
   * `payments` only (DD-L07, phase L6): the last day the person's name must be kept for a booked payment, or null.
   */
  retentionHoldUntil?(
    em: EntityManager,
    subject: { tenantId: string; organizationId: string; personId: string },
  ): Promise<CalendarDate | null>
  /**
   * Optional (engineering standards S9.6, #528): erases the module's personal data of a person being anonymised, in
   * the caller's transaction (`people.persons.anonymize`), and reports the tables it wrote to with row counts and the
   * categories it keeps with their legal basis — never the values. Throws to roll the whole anonymisation back.
   */
  erase?(
    em: EntityManager,
    subject: { tenantId: string; organizationId: string; personId: string },
  ): Promise<ErasurePart>
}

/** The registered contributors in `DEPARTURE_CONTRIBUTOR_MODULES` order; a module that is absent contributes nothing. */
export function departureContributors(
  container: AwilixContainer,
): Array<{ module: DepartureContributorModule; contributor: DepartureContributor }> {
  return DEPARTURE_CONTRIBUTOR_MODULES.filter((module) =>
    container.hasRegistration(departureContributorToken(module)),
  ).map((module) => ({
    module,
    contributor: container.resolve<DepartureContributor>(departureContributorToken(module)),
  }))
}
