import { describe, expect, it } from '@jest/globals'
import {
  APPLE_TOUCH_ICON_SIZE,
  VEREINO_THEME_COLOR,
  WEB_APP_BACKGROUND,
  WEB_APP_START_URL,
  clubIdentity,
  escapeHtml,
  isDrawableLogo,
  isMemberPath,
  publicLogoVersion,
  offlinePageHtml,
  shouldShowIosInstallHint,
  vereinoIdentity,
  webAppIconCacheControl,
  webAppIconPath,
  webAppIconSize,
  webAppManifest,
} from '../web-app'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'

describe('identities', () => {
  it("Vereino's own identity names no club and shows the mark", () => {
    expect(vereinoIdentity('Vereino')).toEqual({
      name: 'Vereino',
      accentColor: null,
      icon: 'mark',
      initial: 'V',
      version: 'mark',
    })
  })

  it('a club without a logo shows the mark; the version follows the colour', () => {
    expect(clubIdentity({ name: 'KS Orzeł', accentColor: '#1b8f3a', logoId: null })).toEqual({
      name: 'KS Orzeł',
      accentColor: '#1b8f3a',
      icon: 'mark',
      initial: 'K',
      version: 'mark-1b8f3a',
    })
    expect(clubIdentity({ name: 'KS Orzeł', accentColor: null, logoId: null }).version).toBe('mark-none')
  })

  it('a club with a logo draws it; the version follows the logo and the colour', () => {
    expect(clubIdentity({ name: 'Orzeł', accentColor: null, logoId: '0123456789abcdef' })).toMatchObject({
      icon: 'logo',
      version: '01234567-none',
    })
    expect(clubIdentity({ name: 'Orzeł', accentColor: '#ffdd00', logoId: '0123456789abcdef' }).version).toBe(
      '01234567-ffdd00',
    )
  })

  it('draws PNG and JPEG logos only', () => {
    expect(isDrawableLogo('image/png')).toBe(true)
    expect(isDrawableLogo('IMAGE/JPEG')).toBe(true)
    expect(isDrawableLogo('image/webp')).toBe(false)
    expect(isDrawableLogo(null)).toBe(false)
    expect(isDrawableLogo(undefined)).toBe(false)
  })
})

describe('icons', () => {
  it('accepts exactly the manifest sizes and the touch icon size', () => {
    expect(webAppIconSize('192')).toBe(192)
    expect(webAppIconSize('512')).toBe(512)
    expect(webAppIconSize(String(APPLE_TOUCH_ICON_SIZE))).toBe(180)
    expect(webAppIconSize('256')).toBeNull()
    expect(webAppIconSize('0192')).toBeNull()
    expect(webAppIconSize('192.0')).toBeNull()
    expect(webAppIconSize('')).toBeNull()
  })

  it('the path carries the version', () => {
    expect(webAppIconPath(192, 'mark-1b8f3a')).toBe('/app-icon/192?v=mark-1b8f3a')
    expect(webAppIconPath(512, 'a b')).toBe('/app-icon/512?v=a%20b')
  })

  it('a current versioned URL is kept a day, anything else 5 minutes', () => {
    expect(webAppIconCacheControl('mark-1b8f3a', 'mark-1b8f3a')).toBe('public, max-age=86400')
    expect(webAppIconCacheControl('mark', 'mark-1b8f3a')).toBe('public, max-age=300')
    expect(webAppIconCacheControl(null, 'mark')).toBe('public, max-age=300')
  })
})

describe('webAppManifest', () => {
  it("carries the club's name, icons of 192 and 512 px, the member start URL, standalone and the club colour", () => {
    const identity = clubIdentity({
      name: 'KS Orzeł',
      accentColor: '#1b8f3a',
      logoId: 'abcdef0123456789',
    })
    expect(webAppManifest(identity, 'pl')).toEqual({
      id: '/club',
      name: 'KS Orzeł',
      short_name: 'KS Orzeł',
      lang: 'pl',
      start_url: WEB_APP_START_URL,
      scope: '/',
      display: 'standalone',
      background_color: WEB_APP_BACKGROUND,
      theme_color: '#1b8f3a',
      icons: [
        { src: '/app-icon/192?v=abcdef01-1b8f3a', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/app-icon/512?v=abcdef01-1b8f3a', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    })
  })

  it("uses Vereino's colour without a club colour", () => {
    expect(webAppManifest(vereinoIdentity('Vereino'), 'en').theme_color).toBe(VEREINO_THEME_COLOR)
  })
})

describe('publicLogoVersion', () => {
  it('reads the v parameter of a public logo URL', () => {
    expect(publicLogoVersion('/api/club_core/public/ks-orzel/logo?v=0123abcd')).toBe('0123abcd')
    expect(publicLogoVersion('/api/club_core/public/ks-orzel/logo')).toBeNull()
    expect(publicLogoVersion('/api/club_core/public/ks-orzel/logo?v=')).toBeNull()
    expect(publicLogoVersion(null)).toBeNull()
  })
})

describe('isMemberPath', () => {
  it('is true for /club and the pages below it only', () => {
    expect(isMemberPath('/club')).toBe(true)
    expect(isMemberPath('/club/calendar')).toBe(true)
    expect(isMemberPath('/clubs')).toBe(false)
    expect(isMemberPath('/backend')).toBe(false)
    expect(isMemberPath(null)).toBe(false)
    expect(isMemberPath(undefined)).toBe(false)
  })
})

describe('shouldShowIosInstallHint', () => {
  const base = { userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: false, seen: false, pathname: '/club' }

  it('shows for Safari on an iPhone on a member page the first time', () => {
    expect(shouldShowIosInstallHint(base)).toBe(true)
    expect(shouldShowIosInstallHint({ ...base, userAgent: IPAD_DESKTOP_SAFARI })).toBe(true)
  })

  it('stays hidden once seen, from the home screen, off the member pages and in other browsers', () => {
    expect(shouldShowIosInstallHint({ ...base, seen: true })).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, standalone: true })).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, pathname: '/login' })).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, userAgent: IPHONE_CHROME })).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, userAgent: ANDROID_CHROME })).toBe(false)
    // A Mac without touch is a computer, not an iPad.
    expect(shouldShowIosInstallHint({ ...base, userAgent: IPAD_DESKTOP_SAFARI, maxTouchPoints: 0 })).toBe(false)
  })
})

describe('offline page', () => {
  it('escapes text', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;')
  })

  it('is a self-contained page in the language with the texts and a reload button', () => {
    const html = offlinePageHtml({ lang: 'pl', title: 'Brak <połączenia>', message: 'Sprawdź sieć.', retry: 'Spróbuj' })
    expect(html).toMatch(/^<!doctype html>\n<html lang="pl">/)
    expect(html).toContain('<title>Brak &#60;połączenia&#62;</title>')
    expect(html).toContain('<main data-testid="web-app-offline">')
    expect(html).toContain('<p>Sprawdź sieć.</p>')
    expect(html).toContain('<button type="button" id="web-app-offline-retry">Spróbuj</button>')
    expect(html).toContain('<style>\n')
    expect(html).toContain("<script>document.getElementById('web-app-offline-retry').addEventListener('click',")
    expect(html).not.toMatch(/onclick=|<link|src=/)
  })

  it('carries the request nonce on its inline style and script, never an inline handler (#498)', () => {
    const html = offlinePageHtml({ lang: 'en', title: 'Offline', message: 'No network.', retry: 'Retry', nonce: 'abc+/=' })
    expect(html).toContain('<style nonce="abc+/=">\n')
    expect(html).toContain('<script nonce="abc+/=">')
    expect(html.match(/nonce=/g)).toHaveLength(2)
    expect(html).not.toContain('onclick=')
  })
})
