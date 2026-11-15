// The granted member navigation features (navigation spec REQ-N05, REQ-N06, #258): one `POST /api/auth/feature-check`
// for the fixed list `MEMBER_NAV_FEATURES`, shared by the five member frames for the whole browser session — the same
// call `facilities`' places pages already make. The answer is cached in memory, so it lives until the next full page
// load (sign-out is one: the logout form posts and redirects to `/login`); a focused tab asks again once the answer is
// five minutes old. Until the first answer — pending, or after the check failed — the snapshot is `null` and the bar
// degrades to the three fixed tabs and More with Profile, with no error; a failed first check keeps no answer, so the
// next page asks again, and a failed refresh keeps the last known answer.
// Authorization stays on the routes: the answer only decides which entries to show.
import * as React from 'react'
import { MEMBER_NAV_FEATURES } from '#src/member/member-nav'

export const MEMBER_NAV_FEATURES_STALE_MS = 5 * 60 * 1000

/** Asks which of the features the signed-in user holds; rejects or answers `null` when it cannot tell. */
export type MemberFeatureCheck = (features: readonly string[]) => Promise<readonly string[] | null>

export type MemberNavFeaturesStore = {
  /** The granted features, or `null` while unknown (pending or failed). A stable reference between changes. */
  snapshot: () => readonly string[] | null
  subscribe: (listener: () => void) => () => void
  /** Starts a check unless one is running or an answer is cached (`force`: even with an answer cached). */
  load: (force?: boolean) => void
  /** Asks again when the cached answer is five minutes old (a focused tab). */
  refreshIfStale: () => void
}

export function createMemberNavFeaturesStore(
  check: MemberFeatureCheck,
  now: () => number = Date.now,
): MemberNavFeaturesStore {
  const listeners = new Set<() => void>()
  let granted: readonly string[] | null = null
  let fetchedAt: number | null = null
  let running = false

  const settle = (value: readonly string[] | null) => {
    running = false
    // A failed refresh keeps the last known answer (offline: the last known bar), still stale, so focus asks again.
    if (!value) return
    granted = value
    fetchedAt = now()
    for (const listener of listeners) listener()
  }

  const store: MemberNavFeaturesStore = {
    snapshot: () => granted,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: (force = false) => {
      if (running || (!force && fetchedAt !== null)) return
      running = true
      void Promise.resolve()
        .then(() => check(MEMBER_NAV_FEATURES))
        .then(
          (answer) => {
            settle(answer ? MEMBER_NAV_FEATURES.filter((feature) => answer.includes(feature)) : null)
          },
          () => {
            settle(null)
          },
        )
    },
    refreshIfStale: () => {
      if (fetchedAt !== null && now() - fetchedAt >= MEMBER_NAV_FEATURES_STALE_MS) store.load(true)
    },
  }
  return store
}

/**
 * The app's API client (the platform `apiCall`), passed in by the frames: `@vereino/ui` stays free of the platform's
 * client sources, as the audience picker does with its `request`.
 */
export type MemberApiCall = (url: string, init: RequestInit) => Promise<{ ok: boolean; result?: unknown }>

/** The check over the installed `auth` route; a refused or malformed answer is `null`. */
export function featureCheckOver(call: MemberApiCall): MemberFeatureCheck {
  return async (features) => {
    const answer = await call('/api/auth/feature-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ features }),
    })
    const granted = (answer.result as { granted?: unknown } | null | undefined)?.granted
    return answer.ok && Array.isArray(granted) ? granted.map(String) : null
  }
}

let sharedStore: MemberNavFeaturesStore | null = null

/** The one store of the browser session, created by the first frame that asks (the five frames pass the same client). */
export function sharedMemberNavFeaturesStore(call: MemberApiCall): MemberNavFeaturesStore {
  sharedStore ??= createMemberNavFeaturesStore(featureCheckOver(call))
  return sharedStore
}

/** The slice of the browser `window` the effect listens on (absent on the server). */
export type FocusTarget = {
  addEventListener: (type: 'focus', listener: () => void) => void
  removeEventListener: (type: 'focus', listener: () => void) => void
}

/** The `useEffect` callback: loads the features on mount and asks again on focus once they are stale. */
export function memberNavFeaturesEffect(
  store: MemberNavFeaturesStore,
  target: FocusTarget | undefined = (globalThis as { window?: FocusTarget }).window,
): () => () => void {
  return () => {
    store.load()
    if (!target) return () => {}
    const onFocus = () => {
      store.refreshIfStale()
    }
    target.addEventListener('focus', onFocus)
    return () => {
      target.removeEventListener('focus', onFocus)
    }
  }
}

const serverSnapshot = () => null

/** The granted member navigation features for `memberNav`'s `features`; `null` while pending or failed. */
export function useMemberNavFeatures(
  call: MemberApiCall,
  store: MemberNavFeaturesStore = sharedMemberNavFeaturesStore(call),
): readonly string[] | null {
  React.useEffect(memberNavFeaturesEffect(store), [store])
  return React.useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot)
}
