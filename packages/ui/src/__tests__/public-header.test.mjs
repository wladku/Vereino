// The public header (navigation spec REQ-N09; E09-S07 #261): the club's logo and name linking to its page, one
// labelled `nav` landmark with `aria-current` on the current link, the second scrolling row under 640 px, a long name
// that truncates instead of covering the links (#488), and the title alone while the club is unknown.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicHeader } from '../public/public-header.tsx'
import { PUBLIC_HEADER_LABEL_KEYS } from '../public/public-nav.ts'

const h = React.createElement
const Link = (props) =>
  h(
    'a',
    {
      href: props.href,
      className: props.className,
      'aria-current': props['aria-current'],
      'data-testid': props['data-testid'],
    },
    props.children,
  )
const labels = Object.fromEntries(PUBLIC_HEADER_LABEL_KEYS.map((key) => [key, key]))
labels.nav = 'Club page'
const club = {
  name: 'KS Avocado',
  slug: 'ks-avocado',
  logo: { url: null, source: 'initial', initial: 'K' },
  nav: { facilities: true, events: false },
}
const render = (props) =>
  renderToStaticMarkup(h(PublicHeader, { club, title: 'Club page', labels, pathname: '/p/ks-avocado', Link, ...props }))

test('the club: its initial and name linking to its page, the links in one labelled nav', () => {
  const html = render({ headerEnd: h('span', { id: 'switcher' }, 'PL') })
  assert.match(
    html,
    /^<header class="bg-card border-b" data-testid="public-header"><div aria-hidden="true" class="bg-club-accent h-1" data-testid="public-header-accent"><\/div>/,
  )
  // The initial sits on the club's colour (#486), never on grey.
  assert.match(
    html,
    /<span aria-hidden="true" class="bg-club-accent text-club-accent-foreground [^"]*" data-testid="public-logo-initial"/,
  )
  assert.match(html, /<div class="mx-auto flex max-w-3xl /)
  // From 640 px (`sm`) one row that never wraps: the name takes the room the links leave and truncates, its full text in
  // `title`; the links keep their own width and are never pushed under the name (#488).
  assert.match(html, /<div class="mx-auto flex max-w-3xl [^"]*flex-wrap[^"]* sm:flex-nowrap"/)
  assert.match(
    html,
    /<div class="order-1 flex min-w-0 flex-1 basis-0 sm:min-w-24" data-testid="public-header-club"><a href="\/p\/ks-avocado" class="[^"]*min-w-0[^"]*" data-testid="public-club-link"><span aria-hidden="true" [^>]*data-testid="public-logo-initial" data-logo-source="initial">K<\/span><span class="truncate" title="KS Avocado" data-testid="public-header-club-name">KS Avocado<\/span><\/a><\/div>/,
  )
  assert.equal(html.match(/<nav /g).length, 1)
  assert.match(html, /<nav aria-label="Club page" class="order-3 [^"]*w-full overflow-x-auto sm:order-2/)
  const navClass = html.match(/<nav aria-label="Club page" class="([^"]*)"/)[1]
  assert.match(navClass, /sm:min-w-0/)
  assert.doesNotMatch(navClass, /flex-1/)
  assert.match(html, /<ul class="flex items-center gap-1">/)
  assert.match(
    html,
    /<a href="\/p\/ks-avocado" class="[^"]*font-semibold[^"]*" aria-current="page" data-testid="public-nav-club">club<\/a>/,
  )
  assert.match(
    html,
    /<a href="\/p\/ks-avocado#sections" class="[^"]*text-muted-foreground[^"]*" data-testid="public-nav-sections">sections<\/a>/,
  )
  assert.match(html, /data-testid="public-nav-facilities">facilities<\/a>/)
  assert.doesNotMatch(html, /public-nav-events/)
  assert.match(html, /<a href="\/login\?club=ks-avocado" [^>]*data-testid="public-nav-signIn">signIn<\/a>/)
  assert.equal(html.match(/aria-current/g).length, 1)
  const section = render({ pathname: '/p/ks-avocado/sections/football' })
  assert.match(section, /aria-current="location" data-testid="public-nav-sections"/)
  assert.equal(section.match(/aria-current/g).length, 1)
  assert.match(
    html,
    /<div class="order-2 shrink-0 sm:order-3" data-testid="public-header-end"><span id="switcher">PL<\/span><\/div>/,
  )
})

test('a club logo is an image with an empty alt; a wide page widens the header', () => {
  const html = render({ club: { ...club, logo: { url: '/logo.png', source: 'club', initial: 'K' } }, wide: true })
  assert.match(html, /<div class="mx-auto flex max-w-5xl /)
  assert.match(
    html,
    /<img src="\/logo.png" alt="" width="40" height="40" class="bg-muted size-10 shrink-0 rounded-md object-contain" data-testid="public-logo" data-logo-source="club"\/>/,
  )
  assert.doesNotMatch(html, /order-2 sm:order-3/)
})

test('no club yet: the title alone, no links, the header end kept', () => {
  const html = render({ club: null, headerEnd: h('span', { id: 'switcher' }, 'PL') })
  assert.match(html, /<span class="text-muted-foreground text-sm" data-testid="public-header-title">Club page<\/span>/)
  assert.doesNotMatch(html, /<nav|public-club-link/)
  assert.match(html, /<span id="switcher">PL<\/span>/)
  const bare = render({ club: null, wide: true })
  assert.match(bare, /max-w-5xl/)
  assert.doesNotMatch(bare, /switcher/)
})
