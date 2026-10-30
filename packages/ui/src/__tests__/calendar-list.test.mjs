// TEST-G06 (unit part, foundation II P-23, DD-G08): the member calendar list over `CalendarDay[]`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarList } from '../member/calendar-list.tsx'
import { formatDayHeading } from '../member/calendar-format.ts'

const h = React.createElement
const labels = { empty: 'No classes in this period', done: 'Done', cancelled: 'Cancelled' }
const Link = (props) => h('a', { href: props.href, className: props.className }, props.children)

const item = (overrides = {}) => ({
  id: 'occ-1',
  title: 'Training',
  startsAt: new Date('2026-11-03T16:00:00Z'),
  endsAt: new Date('2026-11-03T17:30:00Z'),
  status: 'planned',
  ...overrides,
})
const days = (...items) => [{ date: '2026-11-03', items }]
const render = (props) =>
  renderToStaticMarkup(h(CalendarList, { locale: 'en-GB', timeZone: 'Europe/Warsaw', labels, ...props }))

/** Depth-first search of a React element tree for the elements a predicate accepts. */
function findElements(node, predicate, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, found)
    return found
  }
  if (!React.isValidElement(node)) return found
  if (predicate(node)) found.push(node)
  return findElements(node.props.children, predicate, found)
}

test('renders the empty state when there are no days', () => {
  assert.equal(
    render({ days: [] }),
    '<p class="text-muted-foreground text-sm" data-testid="calendar-empty">No classes in this period</p>',
  )
})

test('renders one section per day with the heading, the time range in the club zone and a plain title', () => {
  const html = render({ days: days(item()) })
  assert.match(
    html,
    /^<div class="flex flex-col gap-6"><section class="flex flex-col gap-2" data-testid="calendar-day" data-date="2026-11-03">/,
  )
  assert.match(html, new RegExp(`<h2 class="text-sm font-semibold">${formatDayHeading('2026-11-03', 'en-GB')}</h2>`))
  assert.match(
    html,
    /<li class="bg-card flex flex-col gap-2 rounded-lg border p-4" data-testid="calendar-item" data-item-id="occ-1">/,
  )
  assert.match(html, /<time dateTime="2026-11-03T16:00:00.000Z">17:00–18:30<\/time>/)
  assert.match(html, /<p class="font-semibold">Training<\/p>/)
  // A planned item shows no status badge and none of the optional lines.
  assert.doesNotMatch(html, /Done|Cancelled|line-through|data-action-id/)
})

test('appends the extra class to the list wrapper', () => {
  assert.match(render({ days: days(item()), className: 'mt-4' }), /^<div class="flex flex-col gap-6 mt-4">/)
})

test('renders subtitle, group, place with its address and the badges as muted lines and StatusBadges', () => {
  const html = render({
    days: days(
      item({
        subtitle: 'Jaś',
        group: 'Żaki',
        place: 'Boisko',
        placeAddress: 'ul. Sportowa 1',
        badges: [{ id: 'declared', label: 'Present', tone: 'success' }],
      }),
    ),
  })
  assert.match(html, /<p class="text-muted-foreground text-sm">Jaś<\/p>/)
  assert.match(html, /<p class="text-muted-foreground text-sm">Żaki<\/p>/)
  assert.match(html, /<p class="text-muted-foreground text-sm">Boisko<span class="block">ul. Sportowa 1<\/span><\/p>/)
  assert.match(
    html,
    /<div class="flex flex-wrap gap-2"><div data-slot="badge" data-variant="success"[^>]*>Present<\/div><\/div>/,
  )
  // A place without an address renders the name alone.
  assert.match(
    render({ days: days(item({ place: 'Boisko' })) }),
    /<p class="text-muted-foreground text-sm">Boisko<\/p>/,
  )
})

test('a done item is muted with a "Done" badge; a cancelled one is struck through with a "Cancelled" badge', () => {
  const done = render({ days: days(item({ status: 'done' })) })
  assert.match(done, /<time dateTime="2026-11-03T16:00:00.000Z" class="text-muted-foreground">/)
  assert.match(done, /<div data-slot="badge" data-variant="success"[^>]*>Done<\/div>/)
  assert.match(done, /<p class="font-semibold text-muted-foreground">Training<\/p>/)
  const cancelled = render({ days: days(item({ status: 'cancelled' })) })
  assert.match(cancelled, /<div data-slot="badge" data-variant="error"[^>]*>Cancelled<\/div>/)
  assert.match(cancelled, /<p class="font-semibold line-through">Training<\/p>/)
})

test('the title is a link only when both the link component and the href are given', () => {
  const linked = render({ days: days(item({ href: '/club/sessions/occ-1' })), Link })
  assert.match(
    linked,
    /<a href="\/club\/sessions\/occ-1" class="font-semibold focus-visible:shadow-focus rounded-sm outline-none">Training<\/a>/,
  )
  assert.match(render({ days: days(item({ href: '/club/sessions/occ-1' })) }), /<p class="font-semibold">Training<\/p>/)
  assert.match(render({ days: days(item()), Link }), /<p class="font-semibold">Training<\/p>/)
})

test('actions render as small buttons with the variant of their tone, disabled when told or while the item is busy', () => {
  const actions = [
    { id: 'present', label: 'I will come', tone: 'primary' },
    { id: 'absent', label: 'Report absence', tone: 'destructive' },
    { id: 'details', label: 'Details' },
    { id: 'closed', label: 'Closed', disabled: true },
  ]
  const html = render({ days: days(item({ actions })) })
  assert.match(
    html,
    /<button[^>]*class="[^"]*bg-primary [^"]*min-h-11"[^>]*data-action-id="present">I will come<\/button>/,
  )
  assert.match(
    html,
    /<button[^>]*class="[^"]*border-destructive[^"]*"[^>]*data-action-id="absent">Report absence<\/button>/,
  )
  assert.match(
    html,
    /<button[^>]*class="[^"]*border bg-background[^"]*"[^>]*data-action-id="details">Details<\/button>/,
  )
  assert.match(html, /<button[^>]*disabled=""[^>]*data-action-id="closed">Closed<\/button>/)
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1)
  const busy = render({ days: days(item({ actions })), busyItemId: 'occ-1' })
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 4)
  const otherBusy = render({ days: days(item({ actions })), busyItemId: 'occ-2' })
  assert.equal((otherBusy.match(/disabled=""/g) ?? []).length, 1)
})

test('clicking an action calls onAction with the item and action ids, and does nothing without a handler', () => {
  const calls = []
  const props = {
    days: days(item({ actions: [{ id: 'absent', label: 'Report absence' }] })),
    locale: 'pl',
    timeZone: 'Europe/Warsaw',
    labels,
  }
  // The components use no hooks, so their trees can be built by calling them like functions.
  const itemElements = findElements(CalendarList(props), (node) => typeof node.type === 'function')
  assert.equal(itemElements.length, 1)
  const buttons = (listProps) =>
    findElements(
      itemElements[0].type({ ...itemElements[0].props, ...listProps }),
      (node) => node.props['data-action-id'] === 'absent',
    )
  const [button] = buttons({ onAction: (itemId, actionId) => calls.push([itemId, actionId]) })
  button.props.onClick()
  assert.deepEqual(calls, [['occ-1', 'absent']])
  const [silent] = buttons({ onAction: undefined })
  assert.doesNotThrow(() => silent.props.onClick())
})
