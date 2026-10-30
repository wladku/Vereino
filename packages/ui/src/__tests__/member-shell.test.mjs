// The member shell (foundation II P-23): the markup `/club` has rendered since #27, now behind props.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberShell } from '../member/member-shell.tsx'

const h = React.createElement
const Link = (props) =>
  h('a', { href: props.href, className: props.className, 'aria-current': props['aria-current'] }, props.children)

const nav = [
  { href: '/club', label: 'Today', current: true },
  { href: '/club/calendar', label: 'Calendar', current: false },
]

const render = (props) =>
  renderToStaticMarkup(
    h(
      MemberShell,
      { brand: { name: 'KS Avocado' }, nav, navLabel: 'Member area', Link, ...props },
      h('p', null, 'body'),
    ),
  )

test('renders the brand, the navigation with aria-current on the current page and the body in main', () => {
  const html = render({})
  assert.match(html, /^<div class="bg-background text-foreground min-h-svh"><header class="bg-card border-b">/)
  assert.match(
    html,
    /<p class="flex items-center gap-2 text-sm font-semibold" data-testid="club-name"><span>KS Avocado<\/span><\/p>/,
  )
  assert.match(html, /<nav aria-label="Member area" class="flex flex-wrap items-center gap-1">/)
  assert.match(
    html,
    /<a href="\/club" class="text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4" aria-current="page">Today<\/a>/,
  )
  assert.match(
    html,
    /<a href="\/club\/calendar" class="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm">Calendar<\/a>/,
  )
  assert.doesNotMatch(html, /club-logo/)
  assert.match(html, /<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6"><p>body<\/p><\/main><\/div>$/)
})

test('renders the logo as a decorative 32 px image when the brand has one', () => {
  const html = render({ brand: { name: 'KS Avocado', logoUrl: '/logo.png' } })
  assert.match(
    html,
    /<img src="\/logo.png" alt="" width="32" height="32" class="bg-muted size-8 rounded object-contain" data-testid="club-logo"\/><span>KS Avocado<\/span>/,
  )
})

test('renders no navigation while there are no items (the profile is not loaded yet)', () => {
  const html = render({ nav: [] })
  assert.doesNotMatch(html, /<nav/)
})

test('renders the banner between the header and main', () => {
  const html = render({ banner: h('div', { 'data-testid': 'banner' }, 'conflict') })
  assert.match(html, /<\/header><div data-testid="banner">conflict<\/div><main/)
})
