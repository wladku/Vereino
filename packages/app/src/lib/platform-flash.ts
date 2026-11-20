// The platform's own toasts that Open Mercato 0.9.0 writes in English only (`@open-mercato/ui`
// `backend/utils/api.ts`: `formatForbiddenAccessMessage`, `redirectToSessionRefresh`; #483, epic #479 owner decision 7).
// `platformFlashText` recognizes those exact texts and names the catalog key (with its values) that replaces them, so
// `PlatformFlashTranslator` shows the toast in the page language. Any other text is left alone. Remove together with
// the translator once the platform translates the toasts itself (upstream report: E20-S18).

export type PlatformFlashText = { key: string; params?: Record<string, string> }

const MISSING_FEATURES = /^Access denied: you are missing the required permission "(.+)"\. Contact your administrator\.$/
const REQUIRED_ROLES = /^Access denied: this area requires the role "(.+)"\. Contact your administrator\.$/
const NO_PERMISSION = 'Access denied: you do not have permission to perform this action.'
const SESSION_EXPIRED = 'Session expired. Redirecting to sign in…'

/**
 * The catalog key replacing a platform toast, or null for any other text. The role variant names the platform's
 * default role ("admin") whenever a refusal carries no hint, which says nothing true to a club member, so it becomes
 * the plain "no permission" text.
 */
export function platformFlashText(message: string): PlatformFlashText | null {
  const features = MISSING_FEATURES.exec(message)
  if (features) return { key: 'vereino.flash.accessDeniedFeature', params: { features: features[1] } }
  if (message === NO_PERMISSION || REQUIRED_ROLES.test(message)) return { key: 'vereino.flash.accessDenied' }
  if (message === SESSION_EXPIRED) return { key: 'vereino.flash.sessionExpired' }
  return null
}
