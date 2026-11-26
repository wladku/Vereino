// App-owned backend page replacements, applied by the backend catch-all before it registers the route manifests.
// Not declared in `src/modules.ts`: the worker, scheduler and CLI processes compile that file with esbuild, which
// cannot bundle a React page (lesson `backend-page-replacement-uses-route-override`).
//
// `foundation` replaces both backend profile pages of `auth` (they render the same form) with `ProfileSettingsPage`,
// where a new login e-mail needs the current password (S8.5, ENG-Q-12 answered 2026-11-26; #737).
import { applyPageRouteOverrides } from '@open-mercato/shared/modules/overrides'

const loadProfileSettingsPage = async () =>
  (await import('@/modules/foundation/components/ProfileSettingsPage')).default

export function applyBackendPageOverrides(): void {
  applyPageRouteOverrides({
    '/backend/auth/profile': { load: loadProfileSettingsPage },
    '/backend/profile/change-password': { load: loadProfileSettingsPage },
  })
}
