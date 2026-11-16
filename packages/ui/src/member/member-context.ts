// The acting context of the member pages (README 3.1 and M-02, M-03; club spec phase 1 step 5; E06-S19 #101; spec N,
// REQ-N07): the role-context switcher ("as member / guardian" · "as coach" or "as coach / coordinator") for a person
// with both a member side and a staff grant, and the ward switcher (everyone, one ward, or the member themself) for a
// guardian of more than one ward. A person who only coaches or coordinates acts in the staff context with no switcher.
// The header of every member frame writes the choice; Today and the calendar read it and turn it into the calendar
// queries (`as`, `personId`). The choice lives in the tab's session storage under the person's id, so it survives
// moving between tabs, is never handed to another person signing in on the same phone, and is cleared on sign-out.
// Authorization stays on the routes: the context only picks which of the member's own views to ask for.
import * as React from 'react'
import type { MemberShellLabels } from '#src/member/member-nav'
import type { MemberSwitcher } from '#tsx/member/member-shell'

/** `member` — the person's own and their wards' side; `staff` — the coach and coordinator side (DD-N08). */
export type MemberRoleContext = 'member' | 'staff'
/** `all` — every ward; `self` — the member's own sessions; otherwise a ward's person id. */
export type MemberWardChoice = 'all' | 'self' | (string & {})

export type MemberContextSelection = { role: MemberRoleContext; ward: MemberWardChoice }

/** The slice of `GET /api/people/me` the context needs. */
export type MemberContextProfile = {
  person: { id: string }
  wards: readonly { personId: string; firstName: string; lastName: string }[]
  contexts: readonly string[]
  /** An active participant membership today; absent counts as none. */
  isParticipant?: boolean
}

/** The context before the profile is known. */
export const DEFAULT_MEMBER_CONTEXT: MemberContextSelection = { role: 'member', ward: 'all' }

/** A staff scope the staff context carries; spec A's coordinator pages read it (spec N, *Business rules*). */
export type MemberStaffScope = 'coach' | 'coordinator'

const STAFF_SCOPES: readonly MemberStaffScope[] = ['coach', 'coordinator']

/** The staff scopes the person holds by their grants: `coach`, `coordinator` or both. */
export function memberStaffScopes(profile: MemberContextProfile): MemberStaffScope[] {
  return STAFF_SCOPES.filter((scope) => profile.contexts.includes(scope))
}

/** The member side: a ward, or an active participant membership today. */
export function hasMemberSide(profile: MemberContextProfile): boolean {
  return profile.wards.length > 0 || profile.isParticipant === true
}

/**
 * The contexts the person may act in, the default first: the staff context for a `coach` or `coordinator` grant, and
 * the member context for a member side or for anyone without a staff grant.
 */
export function memberRoles(profile: MemberContextProfile): [MemberRoleContext, ...MemberRoleContext[]] {
  if (memberStaffScopes(profile).length === 0) return ['member']
  return hasMemberSide(profile) ? ['member', 'staff'] : ['staff']
}

/**
 * The ward switcher is offered to a guardian, while acting as a member: everyone or one ward for more than one ward,
 * and always "Me", so a guardian who also trains keeps their own sessions (the calendar's former "My sessions").
 */
export function showsWardSwitcher(profile: MemberContextProfile, selection: MemberContextSelection): boolean {
  return selection.role === 'member' && profile.wards.length > 0
}

/** A stored choice that still fits the profile; anything else (a ward no longer theirs, a lost role) is the default. */
export function resolveMemberContext(profile: MemberContextProfile, stored: unknown): MemberContextSelection {
  const roles = memberRoles(profile)
  const fallback: MemberContextSelection = { role: roles[0], ward: DEFAULT_MEMBER_CONTEXT.ward }
  if (!stored || typeof stored !== 'object') return fallback
  const { role, ward } = stored as Record<string, unknown>
  const resolvedRole = roles.find((entry) => entry === role) ?? fallback.role
  // One ward is chosen as "all" (the switcher names it), so a ward id fits only while there are several.
  const wardFits =
    ward === 'all' ||
    ward === 'self' ||
    (profile.wards.length > 1 && profile.wards.some((entry) => entry.personId === ward))
  return { role: resolvedRole, ward: wardFits ? (ward as MemberWardChoice) : fallback.ward }
}

export type MemberCalendarScope = { as: 'guardian' | 'self' | 'coach'; personId: string | null }

/** The member side's calendar query: the member's own sessions, or the wards' (all or one, by the ward choice). */
export function memberSideScope(profile: MemberContextProfile, selection: MemberContextSelection): MemberCalendarScope {
  if (profile.wards.length === 0) return { as: 'self', personId: null }
  if (selection.ward === 'all') return { as: 'guardian', personId: null }
  if (selection.ward === 'self') return { as: 'self', personId: null }
  return { as: 'guardian', personId: selection.ward }
}

const COACH_SCOPE: MemberCalendarScope = { as: 'coach', personId: null }

/**
 * The calendar queries the context asks for (spec N, *Business rules* → calendar in the member context): the staff
 * context asks for the coached sessions only; the member context asks for the member side and — for a person who
 * coaches — the coached sessions too, which the calendar merges into one list by start time.
 */
export function memberCalendarScopes(
  profile: MemberContextProfile,
  selection: MemberContextSelection,
): MemberCalendarScope[] {
  if (selection.role === 'staff') return [COACH_SCOPE]
  const member = memberSideScope(profile, selection)
  return memberStaffScopes(profile).includes('coach') ? [member, COACH_SCOPE] : [member]
}

/** The label key of the staff context: it names the coordinator when the person coordinates. */
export function staffContextLabel(profile: MemberContextProfile): 'contextCoach' | 'contextCoachCoordinator' {
  return memberStaffScopes(profile).includes('coordinator') ? 'contextCoachCoordinator' : 'contextCoach'
}

function wardName(ward: { firstName: string; lastName: string }): string {
  return `${ward.firstName} ${ward.lastName}`.trim()
}

/** The header switchers the profile calls for: the role context, then — acting as a member — the ward. */
export function memberSwitchers(
  profile: MemberContextProfile,
  selection: MemberContextSelection,
  onChange: (next: MemberContextSelection) => void,
  labels: Pick<
    MemberShellLabels,
    'context' | 'contextMember' | 'contextCoach' | 'contextCoachCoordinator' | 'ward' | 'allWards' | 'me'
  >,
): MemberSwitcher[] {
  const switchers: MemberSwitcher[] = []
  const roles = memberRoles(profile)
  if (roles.length > 1) {
    switchers.push({
      id: 'context',
      label: labels.context,
      value: selection.role,
      options: roles.map((role) => ({
        value: role,
        label: role === 'staff' ? labels[staffContextLabel(profile)] : labels.contextMember,
      })),
      onChange: (value) => {
        onChange({ ...selection, role: value === 'staff' ? 'staff' : 'member' })
      },
    })
  }
  if (showsWardSwitcher(profile, selection)) {
    switchers.push({
      id: 'ward',
      label: labels.ward,
      value: selection.ward,
      options: [
        // One ward: "all" is that ward, named, and there is no separate entry for it.
        ...(profile.wards.length > 1
          ? [
              { value: 'all', label: labels.allWards },
              ...profile.wards.map((ward) => ({ value: ward.personId, label: wardName(ward) })),
            ]
          : profile.wards.map((ward) => ({ value: 'all', label: wardName(ward) }))),
        { value: 'self', label: labels.me },
      ],
      onChange: (value) => {
        onChange({ ...selection, ward: value })
      },
    })
  }
  return switchers
}

// --- The session-storage store ---

export type MemberContextStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const MEMBER_CONTEXT_STORAGE_KEY = 'vereino.member-context'

export type MemberContextStore = {
  /** The raw stored text (a string compares by value, so it is a stable `useSyncExternalStore` snapshot). */
  snapshot: () => string | null
  subscribe: (listener: () => void) => () => void
  write: (personId: string, selection: MemberContextSelection) => void
  clear: () => void
}

export function createMemberContextStore(storage: () => MemberContextStorage | null): MemberContextStore {
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  // Storage may be missing (server render) or refuse access (private browsing): the context then stays default.
  const attempt = <T>(action: (target: MemberContextStorage) => T, fallback: T): T => {
    try {
      const target = storage()
      return target ? action(target) : fallback
    } catch {
      return fallback
    }
  }
  return {
    snapshot: () => attempt((target) => target.getItem(MEMBER_CONTEXT_STORAGE_KEY), null),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    write: (personId, selection) => {
      attempt((target) => {
        target.setItem(MEMBER_CONTEXT_STORAGE_KEY, JSON.stringify({ personId, ...selection }))
      }, undefined)
      notify()
    },
    clear: () => {
      attempt((target) => {
        target.removeItem(MEMBER_CONTEXT_STORAGE_KEY)
      }, undefined)
      notify()
    },
  }
}

/** The stored choice of this person, or `null` when the text is missing, malformed or another person's. */
export function storedSelectionOf(raw: string | null, personId: string): unknown {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || (parsed as { personId?: unknown }).personId !== personId) return null
    return parsed
  } catch {
    return null
  }
}

/** The browser's session storage, or `null` outside a browser. */
export function browserSessionStorage(): MemberContextStorage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

/** The store every member frame and page shares within the browser tab. */
export const memberContextStore = createMemberContextStore(browserSessionStorage)

const serverSnapshot = () => null

/** The member's acting context and its setter, shared by the header switchers, Today and the calendar. Before the
 * profile is loaded (`null`) the context is the default and the setter does nothing. */
export function useMemberContext(
  profile: MemberContextProfile | null,
  store: MemberContextStore = memberContextStore,
): [MemberContextSelection, (next: MemberContextSelection) => void] {
  const raw = React.useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot)
  const personId = profile?.person.id ?? null
  const selection = profile
    ? resolveMemberContext(profile, storedSelectionOf(raw, profile.person.id))
    : DEFAULT_MEMBER_CONTEXT
  const setSelection = React.useCallback(
    (next: MemberContextSelection) => {
      if (personId) store.write(personId, next)
    },
    [store, personId],
  )
  return [selection, setSelection]
}

/**
 * Reloads a member page the browser restores from its back-forward cache (`pageshow` with `persisted`), so after
 * sign-out the back button asks the server again — which sends a signed-out user to `/login` — instead of showing the
 * previous person's page from memory on a shared phone. Returns the cleanup; a `useEffect` callback as it stands.
 */
export function reloadOnBackForwardRestore(): () => void {
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload()
  }
  window.addEventListener('pageshow', onPageShow)
  return () => {
    window.removeEventListener('pageshow', onPageShow)
  }
}
