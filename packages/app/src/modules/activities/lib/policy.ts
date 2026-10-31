// Pure rules of attendance declarations (club spec glossary *Declaration*, *Declaration policy*; REQ-007; D-006,
// D-026; foundation II DD-G10): what is declared is the club setting `declaration_kinds` per activity type
// (`absence_only` or `confirm`), who declares for a minor with an account is the policy (`immediate`,
// `guardian_confirm`, `guardian_only`) resolved group > away trip > activity type > club, the declaration status table,
// the closing rule and the per-session summary each kind shows. Time is a parameter (S3.5); nothing here reads the
// database.
import { defineTransitions, isAdultOn, type ActingRole, type CalendarDate } from '@vereino/core'
import type { ActivityType } from './activities-rules'

// --- Vocabulary ---

/** `yes` / `no` / `unknown` (club spec *Declaration*); `unknown` withdraws an earlier declaration. */
export const DECLARED_VALUES = ['yes', 'no', 'unknown'] as const
export type Declared = (typeof DECLARED_VALUES)[number]

export const DECLARATION_STATUSES = ['final', 'pending_guardian', 'rejected_by_guardian'] as const
export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number]

/** What the club's setting says is declared for an activity type (`club_core` `declaration_kinds`, R11). */
export const DECLARATION_KINDS = ['absence_only', 'confirm'] as const
export type DeclarationKind = (typeof DECLARATION_KINDS)[number]

export const POLICY_SCOPES = ['club', 'group', 'away_trip', 'activity_type'] as const
export type PolicyScope = (typeof POLICY_SCOPES)[number]

export const MINOR_DECLARATION_MODES = ['immediate', 'guardian_confirm', 'guardian_only'] as const
export type MinorDeclarationMode = (typeof MINOR_DECLARATION_MODES)[number]

/** After `confirm_timeout_hours`: the ward's declaration stands (`declared`) or is rejected (`rejected`). */
export const TIMEOUT_DEFAULTS = ['declared', 'rejected'] as const
export type TimeoutDefault = (typeof TIMEOUT_DEFAULTS)[number]

export const DECLARATION_SOURCES = ['app', 'link', 'staff'] as const
export type DeclarationSource = (typeof DECLARATION_SOURCES)[number]

export const ACTUAL_ATTENDANCE = ['present', 'absent', 'late'] as const
export type ActualAttendance = (typeof ACTUAL_ATTENDANCE)[number]

/** The default confirmation limit in hours (J-002: "after 24 h the policy's default value applies"). */
export const DEFAULT_CONFIRM_TIMEOUT_HOURS = 24
export const MAX_CONFIRM_TIMEOUT_HOURS = 24 * 14

/**
 * The declaration status table (foundation II P-25): a declaration enters at `final` or `pending_guardian`; the
 * guardian's decision or the expiry job moves a pending one to `final` or `rejected_by_guardian`. A new declaration
 * is not a transition — it re-enters the table at its entry state — so the two settled states are terminal.
 */
export const declarationTransitions = defineTransitions({
  states: DECLARATION_STATUSES,
  entry: ['final', 'pending_guardian'],
  transitions: [
    ['pending_guardian', 'final'],
    ['pending_guardian', 'rejected_by_guardian'],
  ],
  terminal: ['final', 'rejected_by_guardian'],
})

// --- Policies ---

export type PolicyRow = {
  readonly scope: PolicyScope
  /** The group of a `group` policy (a `groups` group id); null for the other scopes. */
  readonly groupId: string | null
  /** The type of an `activity_type` policy; null for the other scopes. */
  readonly activityType: ActivityType | null
  readonly minorDeclarationMode: MinorDeclarationMode
  readonly confirmTimeoutHours: number
  readonly defaultAfterTimeout: TimeoutDefault
}

/**
 * The policies a club starts with (club spec *Declaration policy* defaults, D-006): trainings `immediate`; matches,
 * tournaments, camps and away trips `guardian_confirm`; 24 hours; the ward's declaration stands after the limit.
 */
const CLUB_DEFAULT_POLICY: PolicyRow = {
  scope: 'club',
  groupId: null,
  activityType: null,
  minorDeclarationMode: 'immediate',
  confirmTimeoutHours: DEFAULT_CONFIRM_TIMEOUT_HOURS,
  defaultAfterTimeout: 'declared',
}

export const DEFAULT_POLICIES: readonly PolicyRow[] = [
  CLUB_DEFAULT_POLICY,
  ...(['match', 'tournament', 'camp'] as const).map((activityType): PolicyRow => ({
    scope: 'activity_type',
    groupId: null,
    activityType,
    minorDeclarationMode: 'guardian_confirm',
    confirmTimeoutHours: DEFAULT_CONFIRM_TIMEOUT_HOURS,
    defaultAfterTimeout: 'declared',
  })),
  {
    scope: 'away_trip',
    groupId: null,
    activityType: null,
    minorDeclarationMode: 'guardian_confirm',
    confirmTimeoutHours: DEFAULT_CONFIRM_TIMEOUT_HOURS,
    defaultAfterTimeout: 'declared',
  },
]

/** The built-in fallback when a club has no `club` policy row at all. */
export const BUILT_IN_CLUB_POLICY: PolicyRow = CLUB_DEFAULT_POLICY

/** Why a policy's scope fields do not fit its scope (422 `attendance_policy_scope_invalid`). */
export type PolicyShapeProblem = 'group_required' | 'activity_type_required' | 'scope_field_unexpected'

/** A `group` policy names a group and nothing else; an `activity_type` policy a type; `club` and `away_trip` nothing. */
export function policyShapeProblem(
  scope: PolicyScope,
  groupId: string | null | undefined,
  activityType: string | null | undefined,
): PolicyShapeProblem | null {
  const hasGroup = typeof groupId === 'string' && groupId.length > 0
  const hasType = typeof activityType === 'string' && activityType.length > 0
  if (scope === 'group') return !hasGroup ? 'group_required' : hasType ? 'scope_field_unexpected' : null
  if (scope === 'activity_type') return !hasType ? 'activity_type_required' : hasGroup ? 'scope_field_unexpected' : null
  return hasGroup || hasType ? 'scope_field_unexpected' : null
}

/** The uniqueness key of a policy: one row per scope, group and type (409 `attendance_policy_duplicate`). */
export function policyKey(policy: Pick<PolicyRow, 'scope' | 'groupId' | 'activityType'>): string {
  return `${policy.scope}:${policy.groupId ?? ''}:${policy.activityType ?? ''}`
}

export type PolicySubject = {
  readonly groupId: string
  readonly activityType: ActivityType
  /** `activity.is_away` (step 7); false until the column exists. */
  readonly isAway: boolean
}

/**
 * The policy that governs a session (club spec *Declaration policy* precedence): the group's policy, else the away-trip
 * policy when the activity is an away trip, else the activity type's, else the club's, else the built-in default.
 */
export function resolvePolicy(policies: readonly PolicyRow[], subject: PolicySubject): PolicyRow {
  const find = (predicate: (policy: PolicyRow) => boolean) => policies.find(predicate)
  return (
    find((policy) => policy.scope === 'group' && policy.groupId === subject.groupId) ??
    (subject.isAway ? find((policy) => policy.scope === 'away_trip') : undefined) ??
    find((policy) => policy.scope === 'activity_type' && policy.activityType === subject.activityType) ??
    find((policy) => policy.scope === 'club') ??
    BUILT_IN_CLUB_POLICY
  )
}

// --- Declaring ---

/** A participant is a minor on the session date unless known to be 18 (an unknown birth date fails closed). */
export function isMinorOn(birthDate: CalendarDate | null, onDate: CalendarDate): boolean {
  return birthDate === null || !isAdultOn(birthDate, onDate)
}

/** The declared value an `absence_only` kind refuses: a "yes" (422 `declaration_kind_absence_only`, D-026). */
export function declaredAllowedForKind(kind: DeclarationKind, declared: Declared): boolean {
  return kind === 'confirm' || declared !== 'yes'
}

export type DeclarationWindow = 'open' | 'closed' | 'not_planned'

/** Declarations change until `start_at` (409 `declaration_closed`); a cancelled or done session takes none. */
export function declarationWindow(
  occurrence: { readonly status: string; readonly startAt: Date },
  now: Date,
): DeclarationWindow {
  if (occurrence.status !== 'planned') return 'not_planned'
  return occurrence.startAt.getTime() > now.getTime() ? 'open' : 'closed'
}

export type DeclarationOutcome =
  | { readonly kind: 'final' }
  | {
      readonly kind: 'pending_guardian'
      readonly pendingUntil: Date
      readonly timeoutOutcome: TimeoutDefault
    }
  | { readonly kind: 'guardian_only' }

const HOUR_MS = 60 * 60 * 1000

/**
 * What a declaration becomes (club spec *Declaration policy*): a minor declaring for themself follows the policy —
 * `immediate` is final, `guardian_confirm` waits for the guardian until `now + confirm_timeout_hours`, `guardian_only`
 * is refused (403) — while a guardian, an adult for themself and staff declare finally.
 */
export function declarationOutcome(input: {
  readonly actingRole: ActingRole
  readonly isMinor: boolean
  readonly policy: PolicyRow
  readonly now: Date
  /** The session start: the confirmation never waits past it (the default applies when the session begins). */
  readonly startsAt?: Date
}): DeclarationOutcome {
  if (input.actingRole !== 'self' || !input.isMinor) return { kind: 'final' }
  switch (input.policy.minorDeclarationMode) {
    case 'immediate':
      return { kind: 'final' }
    case 'guardian_only':
      return { kind: 'guardian_only' }
    case 'guardian_confirm': {
      const limit = input.now.getTime() + input.policy.confirmTimeoutHours * HOUR_MS
      const start = input.startsAt?.getTime() ?? limit
      return {
        kind: 'pending_guardian',
        pendingUntil: new Date(Math.min(limit, start)),
        timeoutOutcome: input.policy.defaultAfterTimeout,
      }
    }
  }
}

/** The `source` column of a declaration: staff write `staff`, a member `app` (links arrive with REQ-017). */
export function declarationSource(actingRole: ActingRole): DeclarationSource {
  return actingRole === 'self' || actingRole === 'guardian' ? 'app' : 'staff'
}

/** The status a pending declaration takes after its limit (`advanceWhere` target per `timeout_outcome`). */
export function timeoutStatus(outcome: TimeoutDefault): DeclarationStatus {
  return outcome === 'declared' ? 'final' : 'rejected_by_guardian'
}

// --- Counting ---

export type DeclarationRow = {
  readonly personId: string
  readonly declared: Declared
  readonly declarationStatus: DeclarationStatus
}

/** The value that counts: a final declaration; a pending or rejected one counts as no answer. */
export function effectiveDeclared(row: DeclarationRow | undefined): Declared {
  if (!row || row.declarationStatus !== 'final') return 'unknown'
  return row.declared
}

export type DeclarationSummary = {
  readonly kind: DeclarationKind
  /** `absence_only`: members who did not report an absence count as expected. */
  readonly expected: number
  readonly absent: number
  /** `confirm`: confirmed, declined and unanswered members. */
  readonly confirmed: number
  readonly declined: number
  readonly unanswered: number
}

/**
 * The per-session summary each kind shows (club spec AC-007, TEST-009): under `absence_only` undeclared members are
 * expected and a final `no` is an absence; under `confirm` a final `yes` is confirmed, a final `no` declined and
 * everything else unanswered.
 */
export function declarationSummary(
  kind: DeclarationKind,
  participantIds: readonly string[],
  rows: readonly DeclarationRow[],
): DeclarationSummary {
  const byPerson = new Map(rows.map((row) => [row.personId, row]))
  const summary = { kind, expected: 0, absent: 0, confirmed: 0, declined: 0, unanswered: 0 }
  for (const personId of new Set(participantIds)) {
    const declared = effectiveDeclared(byPerson.get(personId))
    if (kind === 'absence_only') {
      if (declared === 'no') summary.absent += 1
      else summary.expected += 1
    } else if (declared === 'yes') summary.confirmed += 1
    else if (declared === 'no') summary.declined += 1
    else summary.unanswered += 1
  }
  return summary
}

/** The actions a member surface offers for a declaration of `kind` (club spec `/club` Today: D-026). */
export function declarationChoices(kind: DeclarationKind): readonly Declared[] {
  return kind === 'absence_only' ? ['no'] : ['yes', 'no']
}
