// `InvitationSharePanel` (personal invitation link spec REQ-IL01, REQ-IL02; #868): each state of the share sheet — the
// issued link with the QR code, copy, share and the announced copy; issuing, rate-limited, not pending, and the error
// with a retry that calls back.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InvitationSharePanel } from '../member/invitation-share-panel.tsx'
import { QrCode } from '../member/qr-code.tsx'

const h = React.createElement
const URL = 'https://club.example.org/club/i/token-value'
const labels = {
  issuing: 'Preparing the link…',
  warning: 'Share it only with this parent.',
  qrLabel: 'QR code of the invitation link',
  linkField: 'Invitation link',
  copy: 'Copy link',
  share: 'Share',
  copied: 'Link copied',
  validity: 'Valid for 7 days.',
  rateLimited: 'Try again in 3 minutes.',
  notPending: 'Already activated.',
  error: 'The link could not be prepared.',
  retry: 'Try again',
}
const noop = () => {}
const base = { labels, onCopy: noop, onRetry: noop }
const render = (props) => renderToStaticMarkup(h(InvitationSharePanel, { ...base, ...props }))

/** Walks a rendered element tree (function components expanded, except the hook-using `QrCode`) and returns every element `match` accepts. */
function collect(node, match, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, match, found)
    return found
  }
  if (!node || typeof node !== 'object') return found
  if (node.type === QrCode) return found
  if (typeof node.type === 'function') return collect(node.type(node.props), match, found)
  if (match(node)) found.push(node)
  collect(node.props?.children, match, found)
  return found
}

test('issued: the warning, the QR code, the link field, copy and share, the validity', () => {
  const html = render({ state: 'issued', url: URL, canShare: true, onShare: noop })
  assert.match(html, /data-testid="invitation-share-issued"><p class="text-muted-foreground text-sm">Share it only/)
  assert.match(
    html,
    /<svg role="img" aria-label="QR code of the invitation link"[^>]*data-testid="invitation-share-qr">/,
  )
  assert.match(
    html,
    /<span class="font-medium">Invitation link<\/span><input readOnly="" [^>]*value="https:\/\/club\.example\.org\/club\/i\/token-value"/,
  )
  assert.match(html, /<button[^>]*data-testid="invitation-share-copy"[^>]*>Copy link<\/button>/)
  assert.match(html, /<button[^>]*data-testid="invitation-share-share"[^>]*>Share<\/button>/)
  assert.match(html, /<p role="status" aria-live="polite" class="text-sm" data-testid="invitation-share-copied"><\/p>/)
  assert.match(html, /Valid for 7 days\./)
})

test('issued: no share button without a share sheet, and the copy is announced', () => {
  const html = render({ state: 'issued', url: URL, copied: true, canShare: false, onShare: noop })
  assert.doesNotMatch(html, /invitation-share-share/)
  assert.match(html, /data-testid="invitation-share-copied">Link copied<\/p>/)
  assert.doesNotMatch(render({ state: 'issued', url: URL, canShare: true }), /invitation-share-share/)
})

test('issued: copy, share and focusing the field call back or select the link', () => {
  const calls = []
  const tree = InvitationSharePanel({
    ...base,
    state: 'issued',
    url: URL,
    canShare: true,
    onCopy: () => calls.push('copy'),
    onShare: () => calls.push('share'),
  })
  const buttons = collect(tree, (node) => typeof node.props?.onClick === 'function')
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(calls, ['copy', 'share'])
  const [input] = collect(tree, (node) => node.type === 'input')
  let selected = 0
  input.props.onFocus({ currentTarget: { select: () => (selected += 1) } })
  assert.equal(selected, 1)
})

test('issuing, an issued state without a link, rate-limited and not pending', () => {
  assert.match(
    render({ state: 'issuing' }),
    /^<p aria-busy="true" role="status"[^>]*data-testid="invitation-share-issuing">Preparing/,
  )
  assert.match(render({ state: 'issued', url: null }), /invitation-share-issuing/)
  assert.match(
    render({ state: 'rate_limited' }),
    /^<p role="alert"[^>]*data-testid="invitation-share-rate-limited">Try again in 3 minutes\.<\/p>$/,
  )
  assert.match(
    render({ state: 'not_pending' }),
    /^<p role="status"[^>]*data-testid="invitation-share-not-pending">Already activated\.<\/p>$/,
  )
})

test('error: an alert with a retry that calls back', () => {
  let retried = 0
  const html = render({ state: 'error' })
  assert.match(
    html,
    /^<div role="alert"[^>]*data-testid="invitation-share-error"><p class="text-sm">The link could not be prepared\.<\/p>/,
  )
  assert.match(html, /<button[^>]*>Try again<\/button>/)
  const tree = InvitationSharePanel({ ...base, state: 'error', onRetry: () => (retried += 1) })
  const [button] = collect(tree, (node) => typeof node.props?.onClick === 'function')
  button.props.onClick()
  assert.equal(retried, 1)
})
