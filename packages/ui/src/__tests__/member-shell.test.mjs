// The member shell (foundation II P-23; README 3.1; E06-S19 #101): the brand and header switchers, the body, and the
// bottom bar with `aria-current` on the current tab, More (Profile, admin panel, Sign out) and 48 px targets.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberShell } from '../member/member-shell.tsx'
import { memberNav } from '../member/member-nav.ts'

const h = React.createElement
const Link = (props) =>
  h('a', { href: props.href, className: props.className, 'aria-current': props['aria-current'] }, props.children)

const labels = {
  nav: 'Member area',
  today: 'Today',
  calendar: 'Calendar',
  messages: 'Messages',
  more: 'More',
  profile: 'Profile',
  backend: 'Admin panel',
  signOut: 'Sign out',
  context: 'Acting as',
  contextMember: 'Guardian or member',
  contextCoach: 'Coach',
  ward: 'Showing',
  allWards: 'Everyone',
  me: 'Me',
}

const render = (props) =>
  renderToStaticMarkup(
    h(
      MemberShell,
      {
        brand: { name: 'KS Avocado' },
        nav: memberNav({ pathname: '/club', contexts: ['self'], labels }),
        navLabel: 'Member area',
        signOutLabel: 'Sign out',
        Link,
        ...props,
      },
      h('p', null, 'body'),
    ),
  )

test('renders the brand, the body above the bar and the bar with the current tab marked', () => {
  const html = render({})
  assert.match(html, /^<div class="bg-background text-foreground min-h-svh"><header class="bg-card border-b">/)
  assert.match(
    html,
    /<p class="flex items-center gap-2 text-sm font-semibold" data-testid="club-name"><span>KS Avocado<\/span><\/p>/,
  )
  assert.doesNotMatch(html, /club-switchers/)
  assert.match(html, /<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-28"><p>body<\/p><\/main>/)
  assert.match(
    html,
    /<nav aria-label="Member area" class="bg-card fixed inset-x-0 bottom-0 z-40 border-t[^"]*" data-testid="club-bottom-bar">/,
  )
  assert.match(
    html,
    /<a href="\/club" class="[^"]*min-h-14 min-w-12[^"]*text-primary font-semibold" aria-current="page"><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg><span>Today<\/span><\/a>/,
  )
  assert.match(html, /<a href="\/club\/calendar" class="[^"]*text-muted-foreground hover:text-foreground"><svg/)
  assert.match(html, /<a href="\/club\/messages" class="[^"]*text-muted-foreground/)
  assert.doesNotMatch(html, /club-logo/)
})

test('More is a disclosure with Profile and Sign out posting to the auth logout route', () => {
  const html = render({})
  assert.match(
    html,
    /<details class="relative flex flex-1" data-testid="club-more"><summary class="[^"]*text-muted-foreground[^"]*"><svg/,
  )
  assert.match(html, /<span>More<\/span><\/summary>/)
  assert.match(html, /<a href="\/club\/profile" class="hover:bg-accent[^"]*min-h-12[^"]*">Profile<\/a>/)
  assert.doesNotMatch(html, /Admin panel/)
  assert.match(
    html,
    /<form action="\/api\/auth\/logout" method="post"><button type="submit" class="[^"]*min-h-12[^"]*" data-testid="club-sign-out"><svg[^>]*>.*?<\/svg><span>Sign out<\/span><\/button><\/form>/,
  )
})

test('marks More and Profile current on the profile and offers the admin panel to staff', () => {
  const html = render({ nav: memberNav({ pathname: '/club/profile', contexts: ['self', 'coach'], labels }) })
  assert.match(html, /<summary class="[^"]*text-primary font-semibold" aria-current="page">/)
  assert.match(html, /<a href="\/club\/profile" class="[^"]*font-semibold" aria-current="page">Profile<\/a>/)
  assert.match(html, /<a href="\/backend" class="hover:bg-accent[^"]*">Admin panel<\/a>/)
})

test('renders a fourth tab a later module grants', () => {
  const nav = memberNav({
    pathname: '/club/payments',
    contexts: [],
    labels,
    extraTab: { href: '/club/payments', label: 'Payments', icon: 'payments' },
  })
  const html = render({ nav })
  assert.match(
    html,
    /<a href="\/club\/payments" class="[^"]*text-primary font-semibold" aria-current="page"><svg[^>]*><.*?<\/svg><span>Payments<\/span><\/a>/,
  )
  const facilities = render({
    nav: memberNav({
      pathname: '/club',
      contexts: [],
      labels,
      extraTab: { href: '/club/places', label: 'Facilities', icon: 'facilities' },
    }),
  })
  assert.match(
    facilities,
    /<a href="\/club\/places" class="[^"]*text-muted-foreground[^"]*"><svg[^>]*><.*?<\/svg><span>Facilities<\/span><\/a>/,
  )
})

test('renders the header switchers with a visible label tied to each select', () => {
  const html = render({
    switchers: [
      {
        id: 'context',
        label: 'Acting as',
        value: 'member',
        options: [
          { value: 'member', label: 'Guardian or member' },
          { value: 'coach', label: 'Coach' },
        ],
        onChange: () => undefined,
      },
    ],
  })
  assert.match(html, /<div class="flex flex-wrap gap-3" data-testid="club-switchers">/)
  assert.match(
    html,
    /data-testid="club-switcher-context"><label for="club-switcher-context" class="text-muted-foreground text-xs font-medium">Acting as<\/label>/,
  )
  assert.match(html, /<button type="button" role="combobox"[^>]*id="club-switcher-context"/)
})

test('renders the logo as a decorative 32 px image when the brand has one', () => {
  const html = render({ brand: { name: 'KS Avocado', logoUrl: '/logo.png' } })
  assert.match(
    html,
    /<img src="\/logo.png" alt="" width="32" height="32" class="bg-muted size-8 rounded object-contain" data-testid="club-logo"\/><span>KS Avocado<\/span>/,
  )
})

test('renders no bar and no bar padding while the profile is not loaded', () => {
  const html = render({ nav: null })
  assert.doesNotMatch(html, /<nav/)
  assert.match(html, /<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6"><p>body<\/p><\/main><\/div>$/)
})

test('renders the banner between the header and main', () => {
  const html = render({ banner: h('div', { 'data-testid': 'banner' }, 'conflict') })
  assert.match(html, /<\/header><div data-testid="banner">conflict<\/div><main/)
})
