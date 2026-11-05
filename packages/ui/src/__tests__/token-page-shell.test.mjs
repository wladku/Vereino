// `TokenPageShell` (foundation P-19, phase C; REQ-F14; M-14): the frame of a personal-link page in each state —
// loading, expired (410) and not found (404) with the way to request a new link, an error with a retry, and the page.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TokenPageShell } from '../member/token-page-shell.tsx'

const h = React.createElement
const Link = (props) => h('a', { href: props.href, className: props.className }, props.children)
const labels = {
  title: 'Attendance',
  loading: 'Loading…',
  expiredTitle: 'Link expired',
  expiredMessage: 'Request a new one.',
  notFoundTitle: 'Invalid link',
  notFoundMessage: 'Check the address.',
  errorMessage: 'The page could not be loaded.',
  retry: 'Try again',
  requestLink: 'Request a new link',
}
const render = (props, children = null) =>
  renderToStaticMarkup(
    h(TokenPageShell, { labels, requestLinkHref: '/club/link', Link, onRetry: () => {}, ...props }, children),
  )

test('loading: the generic title and an announced loading line', () => {
  const html = render({ state: 'loading' })
  assert.match(html, /^<div class="bg-background text-foreground min-h-svh"><header class="bg-card border-b">/)
  assert.match(html, /<span class="font-semibold" data-testid="token-page-club">Attendance<\/span>/)
  assert.match(html, /<main [^>]*data-testid="token-page" data-state="loading">/)
  assert.match(html, /<p role="status"[^>]*data-testid="token-page-loading">Loading…<\/p>/)
})

test('expired and not found: their copy and the link to request a new one', () => {
  const expired = render({ state: 'expired', headerEnd: h('span', { id: 'switcher' }, 'PL') })
  assert.match(expired, /data-testid="token-page-expired"><h1 id="token-page-problem"[^>]*>Link expired<\/h1>/)
  assert.match(expired, /<p class="text-muted-foreground max-w-prose">Request a new one.<\/p>/)
  assert.match(expired, /<a href="\/club\/link"[^>]*>Request a new link<\/a>/)
  assert.match(expired, /<span id="switcher">PL<\/span>/)
  const missing = render({ state: 'not_found' })
  assert.match(missing, /data-testid="token-page-not-found"><h1 id="token-page-problem"[^>]*>Invalid link<\/h1>/)
  assert.match(missing, /Check the address./)
})

test('error: an alert with a retry that calls back', () => {
  let retried = 0
  const html = render({ state: 'error' })
  assert.match(html, /<section role="alert"[^>]*data-testid="token-page-error"><p>The page could not be loaded.<\/p>/)
  assert.match(html, /<button[^>]*>Try again<\/button>/)
  const tree = TokenPageShell({
    state: 'error',
    labels,
    requestLinkHref: '/club/link',
    Link,
    onRetry: () => {
      retried += 1
    },
  })
  const main = tree.props.children[1]
  const body = main.props.children
  const section = body.type(body.props)
  const button = section.props.children[1].props.children
  button.props.onClick()
  assert.equal(retried, 1)
})

test('ok: the club name and the page', () => {
  const html = render({ state: 'ok', clubName: 'KS Avocado' }, h('p', null, 'the page'))
  assert.match(html, /data-testid="token-page-club">KS Avocado<\/span>/)
  assert.match(html, /data-state="ok"><p>the page<\/p><\/main>/)
})
