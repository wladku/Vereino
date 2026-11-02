// Audience targets of `communication` (foundation III REQ-M05, REQ-M06; P-32 `AudiencePicker`): what an announcement
// addresses — its scope type, the section and group snapshots the permission checks match, a label — and the targets
// an author's grants allow, for the composer. Sections and groups come from their owners' directories; activities and
// sessions from the optional `activities.scheduleDirectory` (absent → 422 `audience_kind_unavailable`). An unknown or
// foreign target answers 403 `scope_denied`, like a target outside the author's grants, so nothing is revealed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { hasKind, type AudienceKind, type Scope } from '@vereino/core'
import { foundationErrors } from '@/modules/foundation'
import type { ScheduleTargetFilter } from '../../activities/services/schedule-directory'
import type { AudienceInput } from '../data/validators'
import { grantIds, threadScopeTypeOf, type ThreadScopeType } from '../lib/thread-rules'
import { clubCoreDirectory, clubFacts, groupDirectory, scheduleDirectory, type CommunicationScope } from './directory'

export type ResolvedTarget = {
  scopeType: ThreadScopeType
  scopeId: string | null
  sectionId: string | null
  groupId: string | null
  occurrenceId: string | null
  /** The target's name (a section, a group, an activity, a session line); empty for the club and direct threads. */
  label: string
}

/** A session as the composer and the thread lists name it: "Activity · 2026-11-03 17:00" in the club's zone. */
export function sessionLabel(activityName: string | null, startAt: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(startAt)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  const when = `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
  return activityName ? `${activityName} · ${when}` : when
}

function denied(): Promise<never> {
  return foundationErrors.throw('scope_denied')
}

/** Resolves an audience's target (one id; `club` and `persons` have no single target). */
export async function resolveAudienceTarget(
  container: AwilixContainer,
  scope: CommunicationScope,
  audience: AudienceInput,
  em?: EntityManager,
): Promise<ResolvedTarget> {
  const base = { scopeType: threadScopeTypeOf(audience.kind), scopeId: null, sectionId: null, groupId: null }
  const id = audience.ids?.[0] ?? null
  switch (audience.kind) {
    case 'club':
    case 'persons':
      return { ...base, occurrenceId: null, label: '' }
    case 'section': {
      const section = id ? (await clubCoreDirectory(container).findSections(scope, [id], em)).get(id) : undefined
      if (!section) return denied()
      return { ...base, scopeId: section.id, sectionId: section.id, occurrenceId: null, label: section.name }
    }
    case 'group': {
      const group = id ? (await groupDirectory(container).findGroups(scope, [id], em)).get(id) : undefined
      if (!group) return denied()
      return {
        ...base,
        scopeId: group.id,
        sectionId: group.sectionId,
        groupId: group.id,
        occurrenceId: null,
        label: group.name,
      }
    }
    case 'activity': {
      const directory = scheduleDirectory(container)
      if (!directory) return foundationErrors.throw('audience_kind_unavailable')
      const activity = id ? (await directory.findActivities(scope, [id], em)).get(id) : undefined
      if (!activity) return denied()
      return {
        ...base,
        scopeId: activity.id,
        sectionId: activity.sectionId,
        groupId: activity.groupId,
        occurrenceId: null,
        label: activity.name,
      }
    }
    case 'occurrence': {
      const directory = scheduleDirectory(container)
      if (!directory) return foundationErrors.throw('audience_kind_unavailable')
      const occurrence = id ? (await directory.findOccurrences(scope, [id], em)).get(id) : undefined
      if (!occurrence) return denied()
      const { timeZone } = await clubFacts(container, scope)
      return {
        ...base,
        scopeId: occurrence.id,
        sectionId: occurrence.sectionId,
        groupId: occurrence.groupId,
        occurrenceId: occurrence.id,
        label: sessionLabel(occurrence.activityName, occurrence.startAt, timeZone),
      }
    }
  }
}

/** Which records the author's grants cover for a target kind; `undefined` when the grants allow none. */
function targetFilter(scope: Scope, kind: Exclude<AudienceKind, 'club' | 'persons'>): ScheduleTargetFilter | undefined {
  if (hasKind(scope, 'club_admin')) return null
  const sectionIds = grantIds(scope, 'coordinator')
  const coached = kind === 'section' ? [] : grantIds(scope, 'coach')
  if (sectionIds.length === 0 && coached.length === 0) return undefined
  return { sectionIds, groupIds: coached, occurrenceIds: coached }
}

export type AudienceTargetOption = { id: string; label: string; hint: string | null }

/** How far around today the composer offers sessions. */
const SESSION_WINDOW_PAST_DAYS = 7
const SESSION_WINDOW_FUTURE_DAYS = 60
const DAY_MS = 86_400_000

/** The targets of `kind` the author may address, filtered by `query` (case-insensitive substring), at most 100. */
export async function listAudienceTargets(
  container: AwilixContainer,
  scope: CommunicationScope,
  authorScope: Scope,
  kind: Exclude<AudienceKind, 'club' | 'persons'>,
  query: string | undefined,
): Promise<AudienceTargetOption[]> {
  const filter = targetFilter(authorScope, kind)
  if (filter === undefined) return []
  let options: AudienceTargetOption[]
  if (kind === 'section') {
    const sections = await clubCoreDirectory(container).listSections(scope, filter ? (filter.sectionIds ?? []) : null)
    options = sections.map((section) => ({ id: section.id, label: section.name, hint: null }))
  } else if (kind === 'group') {
    const groups = await groupDirectory(container).listGroups(scope, filter)
    options = groups.map((group) => ({ id: group.id, label: group.name, hint: null }))
  } else {
    const directory = scheduleDirectory(container)
    if (!directory) return []
    if (kind === 'activity') {
      const activities = await directory.listActivities(scope, filter)
      options = activities.map((activity) => ({ id: activity.id, label: activity.name, hint: null }))
    } else {
      const { timeZone } = await clubFacts(container, scope)
      const now = Date.now()
      const sessions = await directory.listOccurrences(scope, filter, {
        from: new Date(now - SESSION_WINDOW_PAST_DAYS * DAY_MS),
        to: new Date(now + SESSION_WINDOW_FUTURE_DAYS * DAY_MS),
      })
      options = sessions.map((session) => ({
        id: session.id,
        label: sessionLabel(session.activityName, session.startAt, timeZone),
        hint: session.status === 'planned' ? null : session.status,
      }))
    }
  }
  const needle = query?.trim().toLowerCase()
  return (needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options).slice(0, 100)
}

/** Labels of many thread targets at once (the thread lists): by `scopeType:scopeId`. */
export async function targetLabels(
  container: AwilixContainer,
  scope: CommunicationScope,
  targets: ReadonlyArray<{ scopeType: ThreadScopeType; scopeId: string | null }>,
): Promise<Map<string, string>> {
  const ids = (type: ThreadScopeType) =>
    targets.flatMap((target) => (target.scopeType === type && target.scopeId ? [target.scopeId] : []))
  const labels = new Map<string, string>()
  const sectionIds = ids('section')
  if (sectionIds.length > 0) {
    for (const [id, section] of await clubCoreDirectory(container).findSections(scope, sectionIds)) {
      labels.set(`section:${id}`, section.name)
    }
  }
  const groupIds = ids('group')
  if (groupIds.length > 0) {
    for (const [id, group] of await groupDirectory(container).findGroups(scope, groupIds)) {
      labels.set(`group:${id}`, group.name)
    }
  }
  const directory = scheduleDirectory(container)
  const activityIds = ids('activity')
  if (directory && activityIds.length > 0) {
    for (const [id, activity] of await directory.findActivities(scope, activityIds)) {
      labels.set(`activity:${id}`, activity.name)
    }
  }
  const occurrenceIds = ids('occurrence')
  if (directory && occurrenceIds.length > 0) {
    const { timeZone } = await clubFacts(container, scope)
    for (const [id, occurrence] of await directory.findOccurrences(scope, occurrenceIds)) {
      labels.set(`occurrence:${id}`, sessionLabel(occurrence.activityName, occurrence.startAt, timeZone))
    }
  }
  return labels
}
