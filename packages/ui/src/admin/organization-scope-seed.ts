// The organization scope a backend page already has, known before anything renders (lesson
// `admin-lists-load-once-scope-seed`). The platform's scope events (`@open-mercato/shared/lib/frontend/organizationEvents`)
// start every page load at "no scope", version 0, and the organization switcher, which loads lazily after the chrome,
// emits the real scope a moment later. That first emission bumps the scope version, so every list whose query key holds
// `useOrganizationScopeVersion()` (each Vereino admin table, the platform dashboard) loads its data a second time and
// redraws its rows under the user — the cause of the E06-S06 and E08-S06 test races (#316, #331).
// `seed` sets the scope from the switcher's own cookies at module load, before the first render, so the version the
// lists start with already is the page's scope and the switcher's emission changes nothing. `announce` is what the
// switcher calls instead of `emitOrganizationScopeChanged` when its answer matches the cookies: after a seed the
// platform drops that unchanged emission, so it sends the event once itself, which is how DataTable and
// OrganizationScopeBoundary learn the scope they compare a later real switch against.
import {
  ORGANIZATION_SCOPE_CHANGED_EVENT,
  emitOrganizationScopeChanged,
  getCurrentOrganizationScope,
  type OrganizationScopeChangedDetail,
} from '@open-mercato/shared/lib/frontend/organizationEvents'

export const ORGANIZATION_COOKIE = 'om_selected_org'
export const TENANT_COOKIE = 'om_selected_tenant'
/** The organization cookie's "all organizations" value (`@open-mercato/shared/lib/auth/server`). */
export const ALL_ORGANIZATIONS_COOKIE_VALUE = '__all__'

/** One cookie of a `document.cookie` string, decoded; null when absent. */
export function readCookie(cookieHeader: string, name: string): string | null {
  for (const entry of cookieHeader.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed.startsWith(`${name}=`)) continue
    const raw = trimmed.slice(name.length + 1)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

/**
 * The scope the server resolved this page with, read from the switcher's cookies; null when the switcher has not
 * written both yet (a first visit), so the switcher resolves the scope and a real change follows.
 */
export function scopeFromCookies(cookieHeader: string): OrganizationScopeChangedDetail | null {
  const organization = readCookie(cookieHeader, ORGANIZATION_COOKIE)
  const tenant = readCookie(cookieHeader, TENANT_COOKIE)
  if (organization === null || !tenant) return null
  return {
    organizationId: organization === '' || organization === ALL_ORGANIZATIONS_COOKIE_VALUE ? null : organization,
    tenantId: tenant,
  }
}

export type ScopeBus = {
  emit: (detail: OrganizationScopeChangedDetail) => void
  current: () => OrganizationScopeChangedDetail
  dispatch: (detail: OrganizationScopeChangedDetail) => void
}

/** The platform's scope events on `window`. */
export const platformScopeBus: ScopeBus = {
  emit: emitOrganizationScopeChanged,
  current: getCurrentOrganizationScope,
  dispatch: (detail) => {
    window.dispatchEvent(new CustomEvent(ORGANIZATION_SCOPE_CHANGED_EVENT, { detail }))
  },
}

export type OrganizationScopeSeed = {
  /** Sets the scope from the cookies; true when it did. */
  seed: (cookieHeader: string) => boolean
  /** Emits the switcher's scope, and once after a seed the event the platform would drop as unchanged. */
  announce: (detail: OrganizationScopeChangedDetail) => void
}

export function createOrganizationScopeSeed(bus: ScopeBus = platformScopeBus): OrganizationScopeSeed {
  let seeded = false
  let announced = false
  return {
    seed(cookieHeader) {
      const scope = scopeFromCookies(cookieHeader)
      if (!scope) return false
      bus.emit(scope)
      seeded = true
      return true
    },
    announce(detail) {
      const before = bus.current()
      const unchanged = before.organizationId === detail.organizationId && before.tenantId === detail.tenantId
      bus.emit(detail)
      if (seeded && unchanged && !announced) {
        announced = true
        bus.dispatch(detail)
      }
    },
  }
}

/** The one seed of the browser page: `BackendHeaderChrome` seeds it, `OrganizationSwitcher` announces through it. */
export const organizationScopeSeed = createOrganizationScopeSeed()
