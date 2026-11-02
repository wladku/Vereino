// P-31 `EmailLayout` and the tree expansion the dispatch worker applies before sending (foundation III REQ-M04).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmailLayout, emailLayoutText } from '../emails/EmailLayout.ts'
import { expandEmailTree } from '../emails/expand-email-tree.ts'

const h = React.createElement

const chrome = {
  lang: 'pl',
  clubName: 'KS <Avocado>',
  reason: 'Otrzymujesz tę wiadomość, ponieważ jesteś opiekunem członka KS <Avocado>.',
  footer: 'Tę wiadomość wysłał KS <Avocado> za pośrednictwem Vereino.',
}

test('renders the club, the body, the button and the footer, with club text escaped', () => {
  const html = renderToStaticMarkup(
    h(
      EmailLayout,
      {
        ...chrome,
        preheader: 'Mecz o 11:00',
        action: { label: 'Otwórz w Vereino', href: 'https://app.example.test/club/messages/1' },
        preferences: { label: 'Zarządzaj ustawieniami e-maili', href: 'https://app.example.test/prefs' },
      },
      h('p', null, '<b>Uwaga</b>'),
    ),
  )
  assert.match(html, /^<div lang="pl" style="/)
  assert.match(html, /<div style="display:none;max-height:0;overflow:hidden">Mecz o 11:00<\/div>/)
  assert.match(html, /data-email-part="club">KS &lt;Avocado&gt;<\/p>/)
  assert.match(html, /<div data-email-part="body"><p>&lt;b&gt;Uwaga&lt;\/b&gt;<\/p><\/div>/)
  assert.match(
    html,
    /href="https:\/\/app.example.test\/club\/messages\/1"[^>]*data-email-part="action">Otwórz w Vereino<\/a>/,
  )
  assert.match(html, /jesteś opiekunem członka KS &lt;Avocado&gt;\.<\/p>/)
  assert.match(html, /href="https:\/\/app.example.test\/prefs"[^>]*>Zarządzaj ustawieniami e-maili<\/a>/)
  assert.doesNotMatch(html, /<img|<script/)
})

test('leaves out the preheader, the button and the preferences link when absent', () => {
  const html = renderToStaticMarkup(h(EmailLayout, chrome))
  assert.doesNotMatch(html, /display:none/)
  assert.doesNotMatch(html, /data-email-part="action"/)
  assert.doesNotMatch(html, /<a /)
  assert.match(html, /<div data-email-part="body"><\/div>/)
})

test('the plain-text alternative carries the same parts', () => {
  assert.equal(
    emailLayoutText(
      {
        ...chrome,
        action: { label: 'Open', href: 'https://app.example.test/a' },
        preferences: { label: 'Preferences', href: 'https://app.example.test/p' },
      },
      '  Body text  ',
    ),
    [
      'KS <Avocado>',
      'Body text',
      'Open: https://app.example.test/a',
      `--\n${chrome.reason}\n${chrome.footer}`,
      'Preferences: https://app.example.test/p',
    ].join('\n\n'),
  )
  assert.equal(
    emailLayoutText(chrome, 'Body'),
    ['KS <Avocado>', 'Body', `--\n${chrome.reason}\n${chrome.footer}`].join('\n\n'),
  )
})

test('expandEmailTree calls function components and keeps host elements, text and class components', () => {
  const Body = (props) => h('p', null, 'Hello ', props.name)
  class Legacy extends React.Component {
    render() {
      return h('span', null, 'legacy')
    }
  }
  const tree = expandEmailTree(
    h(EmailLayout, { ...chrome, action: { label: 'Open', href: 'https://x.test' } }, h(Body, { name: 'Ola' }), [
      h('br', { key: 'br' }),
      h(Legacy, { key: 'legacy' }),
    ]),
  )
  assert.equal(tree.type, 'div')
  const collect = (node, out = []) => {
    if (node == null || typeof node === 'boolean') return out
    if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
    else if (Array.isArray(node)) node.forEach((child) => collect(child, out))
    else if (React.isValidElement(node)) {
      if (typeof node.type === 'function' && !node.type.prototype?.isReactComponent) out.push('!function!')
      collect(node.props.children, out)
    }
    return out
  }
  const text = collect(tree).join('|')
  assert.match(text, /KS <Avocado>/)
  assert.match(text, /Hello \|Ola/)
  assert.match(text, /Open/)
  assert.match(text, /opiekunem/)
  assert.doesNotMatch(text, /!function!/)
  assert.equal(
    renderToStaticMarkup(tree),
    renderToStaticMarkup(
      h(EmailLayout, { ...chrome, action: { label: 'Open', href: 'https://x.test' } }, h(Body, { name: 'Ola' }), [
        h('br', { key: 'br' }),
        h(Legacy, { key: 'legacy' }),
      ]),
    ),
  )
  assert.equal(expandEmailTree('text'), 'text')
  assert.equal(expandEmailTree(null), null)
  assert.deepEqual(expandEmailTree(['a', 1]), ['a', 1])
  const empty = h('hr')
  assert.equal(expandEmailTree(empty), empty)
})
