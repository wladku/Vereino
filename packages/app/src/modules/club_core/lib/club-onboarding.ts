// Creating a club on a shared instance (many clubs spec phase 2, REQ-M05, DD-M08; #630): the reserved labels a club's
// public slug may not take (it becomes the club's subdomain, `<slug>.<club domain>`, DD-M02), the options of the
// operator command `club_core create-club`, and the club address it prints. Pure: the environment is passed in.
import { clubOrigin } from '@vereino/core'
import { isPublicSlug } from './publication'
import { isTimeZone } from './settings'

/**
 * Labels a club's public slug may not take (spec glossary *Club address*): host names the instance itself uses or may
 * use, and the cell labels `c1`…`c9` (DD-M12). Shorter labels are already refused by the slug's minimum length; they are
 * listed so the rule reads complete.
 */
export const RESERVED_CLUB_SLUGS: readonly string[] = [
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'status',
  'demo',
  'blog',
  ...Array.from({ length: 9 }, (_, index) => `c${String(index + 1)}`),
]

/** True when `slug` (as stored: trimmed, lower-case) is one of the reserved labels. */
export function isReservedClubSlug(slug: string): boolean {
  return RESERVED_CLUB_SLUGS.includes(slug)
}

export const CREATE_CLUB_DEFAULT_TIMEZONE = 'Europe/Warsaw'
export const CREATE_CLUB_DEFAULT_LOCALE = 'pl'
export const CLUB_NAME_MAX_LENGTH = 200
const PERSON_NAME_MAX_LENGTH = 100
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type CreateClubOptions = {
  slug: string
  name: string
  adminEmail: string
  adminFirstName: string
  adminLastName: string
  timezone: string
  locale: string
  dryRun: boolean
  /** `--tenant` and `--org`: finish a club whose first run stopped halfway (`status: incomplete`). */
  resume: { tenantId: string; organizationId: string } | null
}

/** The option a problem is about, and what is wrong with it. */
export type CreateClubOptionProblem = {
  option: string
  problem: 'required' | 'invalid' | 'reserved' | 'too_long'
}

export type CreateClubOptionsResult =
  { ok: true; options: CreateClubOptions } | { ok: false; problems: CreateClubOptionProblem[] }

export type CreateClubRawOptions = {
  slug?: string
  name?: string
  'admin-email'?: string
  'admin-first-name'?: string
  'admin-last-name'?: string
  timezone?: string
  locale?: string
  'dry-run'?: boolean
  tenant?: string
  org?: string
}

function text(value: string | undefined): string {
  return value?.trim() ?? ''
}

/**
 * Validates the options of `club_core create-club` before anything is written: the slug is a well-formed public slug
 * (trimmed, lower-cased) and not reserved; the name, the administrator's e-mail and names are present and bounded; the
 * time zone is a known IANA zone (default `Europe/Warsaw`) and the locale a language tag (default `pl`; the command
 * checks it against the supported locales); `--tenant` and `--org` (to finish a club) come together and are uuids.
 * Every problem is reported at once.
 */
export function parseCreateClubOptions(raw: CreateClubRawOptions): CreateClubOptionsResult {
  const problems: CreateClubOptionProblem[] = []
  const slug = text(raw.slug).toLowerCase()
  if (!slug) problems.push({ option: 'slug', problem: 'required' })
  else if (!isPublicSlug(slug)) problems.push({ option: 'slug', problem: 'invalid' })
  else if (isReservedClubSlug(slug)) problems.push({ option: 'slug', problem: 'reserved' })

  const name = text(raw.name)
  if (!name) problems.push({ option: 'name', problem: 'required' })
  else if (name.length > CLUB_NAME_MAX_LENGTH) problems.push({ option: 'name', problem: 'too_long' })

  const adminEmail = text(raw['admin-email']).toLowerCase()
  if (!adminEmail) problems.push({ option: 'admin-email', problem: 'required' })
  else if (adminEmail.length > 320 || !EMAIL_PATTERN.test(adminEmail)) {
    problems.push({ option: 'admin-email', problem: 'invalid' })
  }

  const adminFirstName = text(raw['admin-first-name'])
  const adminLastName = text(raw['admin-last-name'])
  for (const [option, value] of [
    ['admin-first-name', adminFirstName],
    ['admin-last-name', adminLastName],
  ] as const) {
    if (!value) problems.push({ option, problem: 'required' })
    else if (value.length > PERSON_NAME_MAX_LENGTH) problems.push({ option, problem: 'too_long' })
  }

  const timezone = text(raw.timezone) || CREATE_CLUB_DEFAULT_TIMEZONE
  if (!isTimeZone(timezone)) problems.push({ option: 'timezone', problem: 'invalid' })

  const locale = text(raw.locale) || CREATE_CLUB_DEFAULT_LOCALE
  if (!LOCALE_PATTERN.test(locale)) problems.push({ option: 'locale', problem: 'invalid' })

  const tenantId = text(raw.tenant)
  const organizationId = text(raw.org)
  for (const [option, value, other] of [
    ['tenant', tenantId, organizationId],
    ['org', organizationId, tenantId],
  ] as const) {
    if (!value && other) problems.push({ option, problem: 'required' })
    else if (value && !UUID_PATTERN.test(value)) problems.push({ option, problem: 'invalid' })
  }

  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    options: {
      slug,
      name,
      adminEmail,
      adminFirstName,
      adminLastName,
      timezone,
      locale,
      dryRun: raw['dry-run'] === true,
      resume: tenantId && organizationId ? { tenantId, organizationId } : null,
    },
  }
}

/**
 * The address a club is reached at (spec glossary *Club address*): `https://<slug>.<club domain>` when
 * `VEREINO_CLUB_DOMAIN` is set (phase 3; `clubOrigin` of `@vereino/core`), else the club's public page
 * `<APP_URL>/p/<slug>`; null when neither is configured. A trailing slash or a scheme in the configured values is
 * tolerated.
 */
export function clubAddress(slug: string, env: Readonly<Record<string, string | undefined>>): string | null {
  const origin = clubOrigin(slug, env)
  if (origin) return origin
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, '')
  if (appUrl) return `${appUrl}/p/${slug}`
  return null
}
