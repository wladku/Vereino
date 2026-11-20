// Where `/` sends a visitor (#485; owner decision 4 of epic #479). One club runs per instance (product brief D14), and
// the instance names its club by the public slug in `VEREINO_HOME_CLUB_SLUG`: the router then reads that club through
// the approved slug lookup of `clubCorePublicSite` (AGENTS.md exception D-024/D-026) and never searches for a club in
// system scope. A guest lands on the club's public page while it is published, otherwise on `/login`; a signed-in
// visitor goes into the app. Pure: the environment and the lookup's answer are passed in.
import { isPublicSlug } from './publication'

export const HOME_CLUB_SLUG_ENV = 'VEREINO_HOME_CLUB_SLUG'

/** The configured public slug of the instance's club, or null when it is unset or not a well-formed public slug. */
export function homeClubSlug(env: Readonly<Record<string, string | undefined>>): string | null {
  const value = env[HOME_CLUB_SLUG_ENV]?.trim().toLowerCase() ?? ''
  return isPublicSlug(value) ? value : null
}

/**
 * The target of `/`: the app for a signed-in visitor; for a guest the public page of the club when `publishedClubSlug`
 * names a club whose page is published, else the sign-in page.
 */
export function homeRedirect(input: { authenticated: boolean; publishedClubSlug: string | null }): string {
  if (input.authenticated) return '/backend'
  if (input.publishedClubSlug) return `/p/${encodeURIComponent(input.publishedClubSlug)}`
  return '/login'
}
