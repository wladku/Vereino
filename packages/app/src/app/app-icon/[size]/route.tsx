// The icons of the installed app (D-045, E31-S01 #873): `GET /app-icon/{192|512|180}` draws a square PNG of the exact
// size for the request's address: the club's logo (PNG or JPEG) on white, the club's initial on its colour when the
// logo cannot be drawn (WebP), or Vereino's mark when the address names no publishing club or the club has no logo
// (`club_core/lib/web-app.ts`). Sessionless; it names no person. Drawn with Next.js's own `ImageResponse` (no image
// library is added); a drawn icon is kept in memory per address, size and version, so repeated fetches do not redraw.
import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { PRODUCT_NAME } from '@/lib/metadata'
import { VEREINO_THEME_COLOR, WEB_APP_BACKGROUND, webAppIconSize, type WebAppIdentity } from '@/modules/club_core/lib/web-app'
import { requestWebApp } from '@/modules/club_core/services/web-app'
import { accentForeground } from '@vereino/core'

export const dynamic = 'force-dynamic'

const CACHE_LIMIT = 200
const drawn = new Map<string, Uint8Array<ArrayBuffer>>()

function remember(key: string, png: Uint8Array<ArrayBuffer>): void {
  if (drawn.size >= CACHE_LIMIT) {
    const oldest = drawn.keys().next().value
    if (oldest !== undefined) drawn.delete(oldest)
  }
  drawn.set(key, png)
}

/** Vereino's mark (`public/vereino-mark.svg`, light scheme) filling the icon. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" fill={VEREINO_THEME_COLOR} />
      <path d="M10.5 11H15.2L20 24.6L24.8 11H29.5L22.3 29H17.7L10.5 11Z" fill="#fafafa" />
    </svg>
  )
}

function iconContent(identity: WebAppIdentity, size: number, logo: { bytes: Uint8Array; mimeType: string } | null) {
  if (identity.icon === 'logo' && logo) {
    const src = `data:${logo.mimeType};base64,${Buffer.from(logo.bytes).toString('base64')}`
    const inner = Math.round(size * 0.8)
    return (
      <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: WEB_APP_BACKGROUND }}>
        <img src={src} width={inner} height={inner} style={{ objectFit: 'contain' }} alt="" />
      </div>
    )
  }
  if (identity.icon === 'initial') {
    const background = identity.accentColor ?? VEREINO_THEME_COLOR
    return (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          background,
          color: accentForeground(background),
          fontSize: Math.round(size * 0.55),
          fontWeight: 700,
        }}
      >
        {identity.initial}
      </div>
    )
  }
  return <Mark size={size} />
}

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }): Promise<Response> {
  const size = webAppIconSize((await context.params).size)
  if (size === null) return new Response('Not found', { status: 404 })
  const { t } = await resolveTranslations()
  const { identity, logo } = await requestWebApp(t('app.metadata.title', PRODUCT_NAME), true)
  const key = `${(await headers()).get('host') ?? ''}|${String(size)}|${identity.version}`
  let png = drawn.get(key)
  if (!png) {
    const image = new ImageResponse(iconContent(identity, size, logo), { width: size, height: size })
    png = new Uint8Array(await image.arrayBuffer())
    remember(key, png)
  }
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      // The manifest's URLs carry the version, so a changed logo or colour is a new URL; the touch icon has none.
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
