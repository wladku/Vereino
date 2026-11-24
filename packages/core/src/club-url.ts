// The club's own address (many clubs spec phase 3, DD-M02, REQ-M02, REQ-M03; E22-S05 #631): with `VEREINO_CLUB_DOMAIN`
// set, a club is reached at `<public slug>.<club domain>` and every link Vereino sends a club's members points there;
// without it (a one-club instance, tests) links keep using `APP_URL`. Also the sender of a club's e-mails: the club's
// name as the display name in front of the one instance-wide address (Q-M03). Pure: the environment is passed in.

/** The environment variable naming the club domain (DD-M02); unset on a one-club instance. */
export const CLUB_DOMAIN_ENV = 'VEREINO_CLUB_DOMAIN'

type Env = Readonly<Record<string, string | undefined>>

/** The configured club domain as `host[:port]`, lower-case, without a scheme or a trailing slash; null when unset. */
export function clubDomain(env: Env): string | null {
  const value =
    env[CLUB_DOMAIN_ENV]?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '') ?? ''
  return value === '' ? null : value
}

/** The scheme club addresses use: the one written in `VEREINO_CLUB_DOMAIN`, else `APP_URL`'s, else `https:`. */
function clubScheme(env: Env, configuredDomain: string): string {
  // `match[0]` is `http://` or `https://`; dropping the slashes leaves the scheme with its colon.
  const written = /^https?:\/\//i.exec(configuredDomain.trim())
  if (written) return written[0].slice(0, -2).toLowerCase()
  const app = /^https?:\/\//i.exec(env.APP_URL?.trim() ?? '')
  return app ? app[0].slice(0, -2).toLowerCase() : 'https:'
}

/**
 * The origin of a club's address, `<scheme>//<slug>.<club domain>` (no trailing slash), or null when no club domain is
 * configured or the club has no public slug — the caller then links from `APP_URL` as before.
 */
export function clubOrigin(slug: string | null | undefined, env: Env): string | null {
  const domain = clubDomain(env)
  if (!domain || !slug) return null
  return `${clubScheme(env, env[CLUB_DOMAIN_ENV] as string)}//${slug}.${domain}`
}

/** The address part of a `From` value: the text inside `<…>` when there is one, else the whole trimmed value. */
export function senderAddress(from: string | null | undefined): string | null {
  const value = from?.trim() ?? ''
  if (value === '') return null
  const angle = /<[^<>]+>\s*$/.exec(value)
  const address = (angle ? angle[0].trim().slice(1, -1) : value).trim()
  return address === '' ? null : address
}

/**
 * A `From` header value with `displayName` in front of the address of `from` (the instance's configured sender), as a
 * quoted string: line breaks and control characters become spaces (no header injection), quotes and backslashes are
 * escaped. Null when `from` holds no address, so the platform keeps its own default.
 */
export function senderWithDisplayName(displayName: string, from: string | null | undefined): string | null {
  const address = senderAddress(from)
  if (!address) return null
  const name = displayName
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (name === '') return address
  return `"${name.replace(/(["\\])/g, '\\$1')}" <${address}>`
}
