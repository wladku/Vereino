// P-16 renderLocalized (V-11): server-side text (e-mails, notifications) in an explicit locale. The platform's
// `resolveTranslations` follows the request, so this helper composes the installed pieces for a given locale.
import { defaultLocale, type Locale } from '@open-mercato/shared/lib/i18n/config'
import { resolveSupportedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { loadDictionary, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { createFallbackTranslator, type TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { foundationErrors } from '../api/errors'

/** The person's preferred locale, else the club default, else `en` — each only when the app serves it. */
export function localeForPerson(
  person: { preferredLocale?: string | null },
  clubDefault: string | null | undefined,
): Locale {
  return resolveSupportedLocale(person.preferredLocale) ?? resolveSupportedLocale(clubDefault) ?? defaultLocale
}

/**
 * Renders with the dictionary of `locale` (an unknown locale falls back to `en`); a key missing in that
 * dictionary renders the English fallback text the caller passes to `t`.
 */
export async function renderLocalized<T>(
  locale: string | null | undefined,
  render: (t: TranslateWithFallbackFn, locale: Locale) => T | Promise<T>,
): Promise<T> {
  const resolved = resolveSupportedLocale(locale) ?? defaultLocale
  const dictionary = await loadDictionary(resolved)
  return render(createFallbackTranslator(dictionary), resolved)
}

/**
 * The canonical code of a locale the app serves for this request (`en-US` → `en`), or 422 `locale_unsupported` (club
 * spec glossary *Language*: unknown locale → 422). Used by every command that stores a locale (a person's
 * `preferred_locale`, the club's `default_locale`), so a stored value is always one the switcher can render.
 */
export async function assertSupportedLocale(value: string): Promise<Locale> {
  const resolved = resolveSupportedLocale(value, await resolveSupportedLocalesForRequest())
  if (!resolved) return foundationErrors.throw('locale_unsupported')
  return resolved
}
