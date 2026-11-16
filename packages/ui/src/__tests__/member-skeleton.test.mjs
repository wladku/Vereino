// `MemberSkeleton` (navigation spec REQ-N15; #264): each shape renders its default number of pieces inside an
// `aria-hidden` box, the region is `aria-busy` and names what is loading, and `count`, `className` and the test id
// pass through.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemberSkeleton } from '../member/member-skeleton.tsx'

const h = React.createElement
const render = (props) => renderToStaticMarkup(h(MemberSkeleton, { label: 'Loading payments', ...props }))
const pieces = (html, marker) => html.split(marker).length - 1

test('tiles: four cards in a two-column grid, hidden from assistive technology', () => {
  const html = render({ shape: 'tiles', 'data-testid': 'today-loading' })
  assert.match(html, /^<div aria-busy="true" data-testid="today-loading" data-skeleton="tiles">/)
  assert.match(html, /<span role="status" class="sr-only">Loading payments<\/span>/)
  assert.match(html, /<div aria-hidden="true" class="grid grid-cols-1 gap-3 sm:grid-cols-2">/)
  assert.equal(pieces(html, 'rounded-lg border p-4'), 4)
})

test('rows: five list rows by default, or the given count', () => {
  const html = render({ shape: 'rows', className: 'mt-2' })
  assert.match(html, /^<div aria-busy="true" class="mt-2" data-skeleton="rows">/)
  assert.match(html, /<div aria-hidden="true" class="flex flex-col gap-3">/)
  assert.equal(pieces(html, 'border-b pb-3'), 5)
  assert.equal(pieces(render({ shape: 'rows', count: 2 }), 'border-b pb-3'), 2)
})

test('fields: a label and an input per field; at least one piece', () => {
  const html = render({ shape: 'fields' })
  assert.match(html, /<div aria-hidden="true" class="flex flex-col gap-4">/)
  assert.equal(pieces(html, 'h-11 w-full'), 4)
  assert.equal(pieces(render({ shape: 'fields', count: 0 }), 'h-11 w-full'), 1)
})
