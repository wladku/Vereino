// Vereino as an installable web app (D-045, E31-S01 #873): the web app manifest of a club's address, its icons, the
// offline page the service worker keeps and the one-time iPhone hint. Each club address has its own manifest with the
// club's name, logo and colour while the club publishes its page (the same rule as every other sessionless read of a
// club, D-024/D-026); any other address, and a club that does not publish, gets Vereino's own name and mark. Push and a
// native app stay out (N02, N12). Pure: the club's public identity, the locale and the browser facts are passed in.
import { nameInitial } from './files'

/** The member pages: the installed app opens here (the start URL), and the iPhone hint shows only here. */
export const WEB_APP_START_URL = '/club'
/** The icon route; its `[size]` is one of `WEB_APP_ICON_SIZES` or the Apple touch icon size. */
export const WEB_APP_ICON_PATH = '/app-icon'
/** The sizes browsers require for installation (Chrome: 192 and 512 px). */
export const WEB_APP_ICON_SIZES = [192, 512] as const
/** The home screen icon size of an iPhone (`apple-touch-icon`). */
export const APPLE_TOUCH_ICON_SIZE = 180
/** The page the service worker keeps for a navigation without network; it holds no personal data. */
export const WEB_APP_OFFLINE_PATH = '/offline'
/** The colour of Vereino's mark (`oklch(0.205 0 0)` of `public/vereino-mark.svg`), the theme colour without a club colour. */
export const VEREINO_THEME_COLOR = '#171717'
/** The splash screen and icon background. */
export const WEB_APP_BACKGROUND = '#ffffff'
/** The device-local flag of the iPhone hint: set when the hint first shows, so it shows once per device. */
export const IOS_INSTALL_HINT_KEY = 'vereino.installHint.ios'

/** What an icon shows: the club's logo, the club's initial on its colour, or Vereino's mark. */
export type WebAppIconKind = 'logo' | 'initial' | 'mark'

/** The public identity of the address an app is installed from. */
export type WebAppIdentity = {
  name: string
  /** `#rrggbb`, or null for Vereino's theme colour. */
  accentColor: string | null
  icon: WebAppIconKind
  /** The initial of the club's name (drawn on the club colour when the logo cannot be drawn). */
  initial: string
  /** Changes with the logo and the colour, so browsers fetch new icons after a change. */
  version: string
}

/** The logo types an icon can draw (the icon renderer cannot decode WebP; such a logo falls back to the initial). */
const DRAWABLE_LOGO_TYPES: readonly string[] = ['image/png', 'image/jpeg']

/** Vereino's own identity: an address that names no publishing club. */
export function vereinoIdentity(productName: string): WebAppIdentity {
  return { name: productName, accentColor: null, icon: 'mark', initial: nameInitial(productName), version: 'mark' }
}

/**
 * A club's identity from its public name, colour and logo. `logo` is null without a logo; otherwise its attachment id
 * and type: a PNG or JPEG is drawn, any other type shows the initial on the club colour. The version uses the first 8
 * characters of the logo id (as the public logo URL does) and the colour, never anything else.
 */
export function clubIdentity(input: {
  name: string
  accentColor: string | null
  logo: { attachmentId: string; mimeType: string | null } | null
}): WebAppIdentity {
  const colour = input.accentColor ? input.accentColor.replace('#', '') : 'none'
  if (!input.logo)
    return {
      name: input.name,
      accentColor: input.accentColor,
      icon: 'mark',
      initial: nameInitial(input.name),
      version: `mark-${colour}`,
    }
  const drawable = DRAWABLE_LOGO_TYPES.includes((input.logo.mimeType ?? '').toLowerCase())
  return {
    name: input.name,
    accentColor: input.accentColor,
    icon: drawable ? 'logo' : 'initial',
    initial: nameInitial(input.name),
    version: `${input.logo.attachmentId.slice(0, 8)}-${colour}`,
  }
}

/** The icon size a route parameter names, or null for any other value. */
export function webAppIconSize(param: string): number | null {
  if (!/^\d{3}$/.test(param)) return null
  const size = Number(param)
  return size === APPLE_TOUCH_ICON_SIZE || (WEB_APP_ICON_SIZES as readonly number[]).includes(size) ? size : null
}

export function webAppIconPath(size: number, version: string): string {
  return `${WEB_APP_ICON_PATH}/${String(size)}?v=${encodeURIComponent(version)}`
}

export type WebAppManifest = {
  id: string
  name: string
  short_name: string
  lang: string
  start_url: string
  scope: string
  display: 'standalone'
  background_color: string
  theme_color: string
  icons: Array<{ src: string; sizes: string; type: 'image/png'; purpose: 'any' }>
}

/** The web app manifest of an identity in a locale. */
export function webAppManifest(identity: WebAppIdentity, lang: string): WebAppManifest {
  return {
    id: WEB_APP_START_URL,
    name: identity.name,
    short_name: identity.name,
    lang,
    start_url: WEB_APP_START_URL,
    scope: '/',
    display: 'standalone',
    background_color: WEB_APP_BACKGROUND,
    theme_color: identity.accentColor ?? VEREINO_THEME_COLOR,
    icons: WEB_APP_ICON_SIZES.map((size) => ({
      src: webAppIconPath(size, identity.version),
      sizes: `${String(size)}x${String(size)}`,
      type: 'image/png' as const,
      purpose: 'any' as const,
    })),
  }
}

/** Whether a path is a member page (`/club` and below). */
export function isMemberPath(pathname: string | null | undefined): boolean {
  return pathname === WEB_APP_START_URL || (pathname ?? '').startsWith(`${WEB_APP_START_URL}/`)
}

/** iPhone, iPod or iPad (an iPad reports a Mac with touch). */
function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** Safari itself: the other iOS browsers name themselves in the user agent. */
function isSafari(userAgent: string): boolean {
  return /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent)
}

/**
 * Whether the iPhone hint ("Share → Add to Home Screen") shows: Safari on iOS, which offers no install prompt, on a
 * member page, not already opened from the home screen, and not shown on this device before.
 */
export function shouldShowIosInstallHint(input: {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
  seen: boolean
  pathname: string | null
}): boolean {
  if (input.seen || input.standalone || !isMemberPath(input.pathname)) return false
  return isIosDevice(input.userAgent, input.maxTouchPoints) && isSafari(input.userAgent)
}

/** Escapes text for HTML (the offline page is built as a string). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`)
}

/**
 * The offline page: a self-contained HTML document (inline styles, a reload button) that names no person and no club,
 * so one copy can be kept for every user of the device.
 */
export function offlinePageHtml(input: { lang: string; title: string; message: string; retry: string }): string {
  const lang = escapeHtml(input.lang)
  const title = escapeHtml(input.title)
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#171717}
main{max-width:28rem;padding:1.5rem;text-align:center}
h1{font-size:1.25rem;margin:0 0 .75rem}
p{margin:0 0 1.5rem;line-height:1.5}
button{min-height:44px;padding:0 1.25rem;border:0;border-radius:.5rem;background:#171717;color:#fff;font:inherit;cursor:pointer}
button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
@media (prefers-color-scheme:dark){body{background:#171717;color:#fafafa}button{background:#fafafa;color:#171717}}
</style>
</head>
<body>
<main data-testid="web-app-offline">
<h1>${title}</h1>
<p>${escapeHtml(input.message)}</p>
<button type="button" onclick="location.reload()">${escapeHtml(input.retry)}</button>
</main>
</body>
</html>
`
}
