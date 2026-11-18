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

/** The modules that may contribute, in the order their parts are applied and shown. */
export const DEPARTURE_CONTRIBUTOR_MODULES = ['groups', 'activities', 'payments', 'club_core', 'facilities'] as const
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

export type DeparturePreviewPart = {
  items: DepartureItem[]
  warnings: DepartureNotice[]
  blockers: DepartureNotice[]
}

/** What a contributor changed, for its own `afterCommit` (events, cache, search). */
export type DepartureChange = { kind: string; recordId: string; action: 'updated' | 'deleted' | 'created' }

export type DepartureApplyResult = { snapshot: unknown; changes: DepartureChange[] }

export type DepartureCommitContext = { container: AwilixContainer; tenantId: string; organizationId: string }

export type DepartureContributor = {
  /** What the departure would end, warn about or be blocked by. Read only. */
  preview(em: EntityManager, subject: DepartureSubject): Promise<DeparturePreviewPart>
  /** Ends the records in the caller's transaction; throws to roll the whole departure back. */
  apply(em: EntityManager, subject: DepartureSubject, choices: Record<string, unknown>): Promise<DepartureApplyResult>
  /** Restores from the snapshot `apply` returned, in the caller's transaction (until the last day only). */
  undo(em: EntityManager, subject: DepartureSubject, snapshot: unknown): Promise<DepartureChange[]>
  /** After the commit: the module's events, cache invalidation and reindex. A failure is logged, never rolled back. */
  afterCommit(changes: readonly DepartureChange[], ctx: DepartureCommitContext, undo: boolean): Promise<void>
  /** Whether the person has any record in the module, ever (a mistaken person has none; phase L6). */
  hasHistory(
    em: EntityManager,
    subject: { tenantId: string; organizationId: string; personId: string },
  ): Promise<boolean>
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
