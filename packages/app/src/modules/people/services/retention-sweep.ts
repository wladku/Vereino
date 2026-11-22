// The former participants' retention sweep for one club (club spec REQ-041, amendment B; engineering standards S9.5,
// S9.6; #471). The rule is in `lib/retention-rules.ts`; this service reads its facts and runs the sweep:
//   - the cutoff is the club's today minus `former_participant_retention_months` (`club_core` setting, default 12);
//   - the candidates are the persons who left on the cutoff or before and are not anonymised, read in id pages;
//   - their facts come from `people`'s own role assignments and guardianships and from every departure contributor's
//     read-only `preview` on the cutoff (a record still live after it: a membership, a contract, a maintained place, a
//     coached group) — so `people` never imports another module — plus the `payments` notices (open charge, cash held);
//   - each person due is anonymised by `people.persons.anonymize` with the reason `retention_sweep`, one command and one
//     transaction per person, so one audit entry each and accounting rows kept and linked (S9.6).
// Idempotent: an anonymised person is no longer a candidate, and a person the command refuses on the locked row (409
// `anonymize_blocked`, e.g. an overlapping run anonymised them first) counts as kept (#564). Any other failure is
// reported and retried by the next run. Logs and returns counts only, never ids or names.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CalendarDate } from '@vereino/core'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import type { ContributorNotice } from '../lib/erasure-rules'
import {
  RETENTION_SWEEP_REASON,
  emptyRetentionSweepCounts,
  isRetentionRefusal,
  latestEnd,
  monthsBefore,
  retentionKeepReasons,
  type RetentionFacts,
  type RetentionSweepCounts,
} from '../lib/retention-rules'
import { clubSettings, type ClubScope } from './club-clock'
import { departureContributors } from './departure'

/** How many candidates one page reads. */
const PAGE_SIZE = 100

export type RetentionSubject = Pick<Person, 'id' | 'leftOn' | 'anonymizedAt' | 'userId'>

/** The club's retention period and the cutoff it gives on `today`. */
export async function retentionCutoff(
  container: AwilixContainer,
  scope: ClubScope,
  today: CalendarDate,
): Promise<{ months: number; cutoff: CalendarDate }> {
  const months = (await clubSettings(container, scope)).formerParticipantRetentionMonths
  return { months, cutoff: monthsBefore(today, months) }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  map.set(key, [...(map.get(key) ?? []), value])
}

/**
 * The sweep's facts for each person, read with the caller's EntityManager (the anonymisation's transaction, or the
 * sweep's own reader). One query at a time: `em` may be a transaction on a single connection.
 */
export async function retentionFactsOf(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  persons: readonly RetentionSubject[],
  cutoff: CalendarDate,
): Promise<Map<string, RetentionFacts>> {
  const ids = persons.map((person) => person.id)
  const result = new Map<string, RetentionFacts>()
  if (ids.length === 0) return result
  const roles = new Map<string, Array<{ validTo: CalendarDate | null }>>()
  for (const row of await em.find(
    RoleAssignment,
    { ...scope, deletedAt: null, personId: { $in: ids } },
    { fields: ['id', 'personId', 'validTo'] },
  )) {
    push(roles, row.personId, { validTo: row.validTo ?? null })
  }
  const guardianships = new Map<string, Array<{ validTo: CalendarDate | null }>>()
  for (const row of await em.find(
    Guardianship,
    { ...scope, deletedAt: null, $or: [{ guardianPersonId: { $in: ids } }, { wardPersonId: { $in: ids } }] },
    { fields: ['id', 'guardianPersonId', 'wardPersonId', 'validTo'] },
  )) {
    const period = { validTo: row.validTo ?? null }
    for (const personId of new Set([row.guardianPersonId, row.wardPersonId])) push(guardianships, personId, period)
  }
  const records = new Map<string, number>()
  const notices = new Map<string, ContributorNotice[]>()
  for (const { contributor } of departureContributors(container)) {
    const part = await contributor.preview(em, { ...scope, personIds: ids, lastDay: cutoff })
    for (const entry of [...part.items, ...(part.handOvers ?? [])]) {
      records.set(entry.personId, (records.get(entry.personId) ?? 0) + 1)
    }
    for (const notice of [...part.blockers, ...part.warnings]) {
      push(notices, notice.personId, { module: notice.module, code: notice.code })
    }
  }
  for (const person of persons) {
    result.set(person.id, {
      leftOn: person.leftOn ?? null,
      anonymizedAt: person.anonymizedAt ?? null,
      hasAccount: Boolean(person.userId),
      rolesUntil: latestEnd(roles.get(person.id) ?? []),
      guardianshipsUntil: latestEnd(guardianships.get(person.id) ?? []),
      recordsAfterCutoff: records.get(person.id) ?? 0,
      contributorNotices: notices.get(person.id) ?? [],
    })
  }
  return result
}

export type RetentionSweepRun = { months: number; cutoff: CalendarDate; counts: RetentionSweepCounts }

type SweepOptions = {
  today: CalendarDate
  /** Counts who would be anonymised (`anonymized`) and changes nothing. */
  dryRun: boolean
  onFailure: (error: unknown) => void
}

/** One run of the sweep for the club of the job context `ctx` (`jobCommandContext`). */
export async function runRetentionSweep(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  options: SweepOptions,
): Promise<RetentionSweepRun> {
  const { months, cutoff } = await retentionCutoff(ctx.container, scope, options.today)
  const counts = emptyRetentionSweepCounts()
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  const reader = ctx.container.resolve<EntityManager>('em').fork()
  let afterId: string | null = null
  for (;;) {
    const page: RetentionSubject[] = await reader.find(
      Person,
      {
        ...scope,
        deletedAt: null,
        anonymizedAt: null,
        leftOn: { $lte: cutoff },
        ...(afterId ? { id: { $gt: afterId } } : {}),
      },
      { fields: ['id', 'leftOn', 'anonymizedAt', 'userId'], orderBy: { id: 'asc' }, limit: PAGE_SIZE },
    )
    if (page.length === 0) break
    afterId = page[page.length - 1].id
    counts.candidates += page.length
    const facts = await retentionFactsOf(reader, ctx.container, scope, page, cutoff)
    for (const person of page) {
      // `retentionFactsOf` answers every person it is given.
      if (retentionKeepReasons(facts.get(person.id) as RetentionFacts, cutoff).length > 0) {
        counts.kept += 1
        continue
      }
      if (options.dryRun) {
        counts.anonymized += 1
        continue
      }
      try {
        await commandBus.execute('people.persons.anonymize', {
          input: { id: person.id, reason: RETENTION_SWEEP_REASON },
          ctx,
        })
        counts.anonymized += 1
      } catch (error: unknown) {
        // Refused by the rule on the locked row (an overlapping run, or a change since the read): kept, not a fault.
        if (isRetentionRefusal(error)) {
          counts.kept += 1
          continue
        }
        counts.failed += 1
        options.onFailure(error)
      }
    }
    reader.clear()
    if (page.length < PAGE_SIZE) break
  }
  return { months, cutoff, counts }
}
