// The acting context of the member pages (README 3.1 and M-02, M-03; club spec phase 1 step 5; E06-S19 #101): the
// role-context switcher ("as guardian / as coach") for a person who coaches too, and the ward switcher (everyone,
// one ward, or the member themself) for a guardian of more than one ward. The header of every member frame writes the
// choice; Today and the calendar read it and turn it into the calendar query (`as`, `personId`). The choice lives in
// the tab's session storage under the person's id, so it survives moving between tabs, is never handed to another
// person signing in on the same phone, and is cleared on sign-out. Authorization stays on the routes: the context
// only picks which of the member's own views to ask for.
import * as React from 'react'
import type { MemberShellLabels } from '#src/member/member-nav'
import type { MemberSwitcher } from '#tsx/member/member-shell'

export type MemberRoleContext = 'member' | 'coach'
/** `all` — every ward; `self` — the member's own sessions; otherwise a ward's person id. */
export type MemberWardChoice = 'all' | 'self' | (string & {})

export type MemberContextSelection = { role: MemberRoleContext; ward: MemberWardChoice }

/** The slice of `GET /api/people/me` the context needs. */
export type MemberContextProfile = {
  person: { id: string }
  wards: readonly { personId: string; firstName: string; lastName: string }[]
  contexts: readonly string[]
}

export const DEFAULT_MEMBER_CONTEXT: MemberContextSelection = { role: 'member', ward: 'all' }

/** The role-context switcher is offered to a member who also coaches (README 3.1: more than one role). */
export function memberRoles(profile: MemberContextProfile): MemberRoleContext[] {
  return profile.contexts.includes('coach') ? ['member', 'coach'] : ['member']
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
  if (!stored || typeof stored !== 'object') return DEFAULT_MEMBER_CONTEXT
  const { role, ward } = stored as Record<string, unknown>
  const roles = memberRoles(profile)
  const resolvedRole = roles.find((entry) => entry === role) ?? DEFAULT_MEMBER_CONTEXT.role
  // One ward is chosen as "all" (the switcher names it), so a ward id fits only while there are several.
  const wardFits =
    ward === 'all' ||
    ward === 'self' ||
    (profile.wards.length > 1 && profile.wards.some((entry) => entry.personId === ward))
  return { role: resolvedRole, ward: wardFits ? (ward as MemberWardChoice) : DEFAULT_MEMBER_CONTEXT.ward }
}

export type MemberCalendarScope = { as: 'guardian' | 'self' | 'coach'; personId: string | null }

/** The calendar query the context asks for: the coach's groups, the member's own sessions, or the wards'. */
export function memberCalendarScope(
  profile: MemberContextProfile,
  selection: MemberContextSelection,
): MemberCalendarScope {
  if (selection.role === 'coach') return { as: 'coach', personId: null }
  if (profile.wards.length === 0) return { as: 'self', personId: null }
  if (selection.ward === 'all') return { as: 'guardian', personId: null }
  if (selection.ward === 'self') return { as: 'self', personId: null }
  return { as: 'guardian', personId: selection.ward }
}

function wardName(ward: { firstName: string; lastName: string }): string {
  return `${ward.firstName} ${ward.lastName}`.trim()
}

/** The header switchers the profile calls for: the role context, then — acting as a member — the ward. */
export function memberSwitchers(
  profile: MemberContextProfile,
  selection: MemberContextSelection,
  onChange: (next: MemberContextSelection) => void,
  labels: Pick<MemberShellLabels, 'context' | 'contextMember' | 'contextCoach' | 'ward' | 'allWards' | 'me'>,
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
        label: role === 'coach' ? labels.contextCoach : labels.contextMember,
      })),
      onChange: (value) => {
        onChange({ ...selection, role: value === 'coach' ? 'coach' : 'member' })
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
