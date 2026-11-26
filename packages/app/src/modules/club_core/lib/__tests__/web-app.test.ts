import { describe, expect, it } from '@jest/globals'
import {
  APPLE_TOUCH_ICON_SIZE,
  VEREINO_THEME_COLOR,
  WEB_APP_BACKGROUND,
  WEB_APP_START_URL,
  clubIdentity,
  escapeHtml,
  isMemberPath,
  offlinePageHtml,
  shouldShowIosInstallHint,
  vereinoIdentity,
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
    expect(clubIdentity({ name: 'KS Orzeł', accentColor: '#1b8f3a', logo: null })).toEqual({
      name: 'KS Orzeł',
      accentColor: '#1b8f3a',
      icon: 'mark',
      initial: 'K',
      version: 'mark-1b8f3a',
    })
    expect(clubIdentity({ name: 'KS Orzeł', accentColor: null, logo: null }).version).toBe('mark-none')
  })

  it('a PNG or JPEG logo is drawn, any other type shows the initial', () => {
    const logo = (mimeType: string | null) => ({ attachmentId: '0123456789abcdef', mimeType })
    expect(clubIdentity({ name: 'Orzeł', accentColor: null, logo: logo('image/png') })).toMatchObject({
      icon: 'logo',
      version: '01234567-none',
    })
    expect(clubIdentity({ name: 'Orzeł', accentColor: '#ffdd00', logo: logo('IMAGE/JPEG') })).toMatchObject({
      icon: 'logo',
      version: '01234567-ffdd00',
    })
    expect(clubIdentity({ name: 'Orzeł', accentColor: null, logo: logo('image/webp') }).icon).toBe('initial')
    expect(clubIdentity({ name: 'Orzeł', accentColor: null, logo: logo(null) }).icon).toBe('initial')
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
})

describe('webAppManifest', () => {
  it("carries the club's name, icons of 192 and 512 px, the member start URL, standalone and the club colour", () => {
    const identity = clubIdentity({
      name: 'KS Orzeł',
      accentColor: '#1b8f3a',
      logo: { attachmentId: 'abcdef0123456789', mimeType: 'image/png' },
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
    expect(html).toContain('<button type="button" onclick="location.reload()">Spróbuj</button>')
    expect(html).not.toMatch(/<script|<link|src=/)
  })
})
