// TEST-W02 (calendar range switch spec REQ-W02, DD-W01, DD-W02): the shared switch — the views as links in one group
// with `aria-current` on the shown one, the extra tabs before and after, the arrows (replace, full names for screen
// readers, disabled at the window's edge), "Today" hidden inside today's range, the heading, 44 px targets below `sm`;
// and `useWideCalendar` on the server and in a browser.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarRangeSwitch, useWideCalendar } from '../member/calendar-range-switch.tsx'

const h = React.createElement
const labels = {
  group: 'Range',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  earlier: '‹ Earlier',
  later: 'Later ›',
  today: 'Today',
  previous: { day: 'previous day', week: 'previous week', month: 'previous month' },
  next: { day: 'next day', week: 'next week', month: 'next month' },
}
const Link = ({ href, className, children, replace, ...rest }) =>
  h('a', { href, className, 'data-replace': replace ? '1' : undefined, ...rest }, children)
const hrefFor = (range, anchor) => `/cal?range=${range}&date=${anchor}`
const render = (props) =>
  renderToStaticMarkup(
    h(CalendarRangeSwitch, {
      range: 'week',
      anchor: '2026-11-26',
      today: '2026-11-26',
      locale: 'en-US',
      labels,
      hrefFor,
      Link,
      ...props,
    }),
  )

test('the views: one labelled group of links, the shown one current, in the order before · D/W/M · after', () => {
  const html = render({ before: [{ id: 'upcoming', label: 'Upcoming' }], after: [{ id: 'agenda', label: 'Agenda' }] })
  assert.match(html, /<div role="group" aria-label="Range" class="[^"]*">/)
  const order = ['upcoming', 'day', 'week', 'month', 'agenda'].map((id) =>
    html.indexOf(`data-testid="calendar-range-view-${id}"`),
  )
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  )
  assert.ok(order.every((index) => index > 0))
  assert.match(
    html,
    /<a href="\/cal\?range=week&amp;date=2026-11-26" class="[^"]*" aria-current="page" data-testid="calendar-range-view-week" data-slot="button">Week<\/a>/,
  )
  assert.match(
    html,
    /<a href="\/cal\?range=day&amp;date=2026-11-26" class="[^"]*" data-testid="calendar-range-view-day" data-slot="button">Day<\/a>/,
  )
  // A view change pushes a history entry: no `replace` on the tabs.
  assert.doesNotMatch(html, /data-replace="1" data-testid="calendar-range-view/)
  // 44 px targets below `sm`.
  assert.match(html, /min-h-11[^"]*sm:min-h-9[^"]*" aria-current="page"/)
  assert.match(html, /data-testid="calendar-range" data-range="week" data-date="2026-11-26"/)
})

test('the arrows replace the entry and carry their full names; Today hides inside today’s range', () => {
  const html = render({})
  assert.match(
    html,
    /<a href="\/cal\?range=week&amp;date=2026-11-19" class="[^"]*min-h-11[^"]*" data-replace="1" data-testid="calendar-range-previous" data-slot="button"><span aria-hidden="true">‹ Earlier<\/span><span class="sr-only">previous week<\/span><\/a>/,
  )
  assert.match(
    html,
    /href="\/cal\?range=week&amp;date=2026-12-03"[^>]*data-testid="calendar-range-next" data-slot="button"><span aria-hidden="true">Later ›<\/span><span class="sr-only">next week<\/span>/,
  )
  assert.doesNotMatch(html, /calendar-range-today/)
  assert.match(
    html,
    /<p class="text-sm font-medium" aria-live="polite" data-testid="calendar-range-range">November 23\s–\s29<\/p>/u,
  )
})

test('outside today’s range Today leads back to today; an arrow at the window’s edge is disabled', () => {
  const html = render({
    range: 'day',
    anchor: '2026-10-01',
    limits: { min: '2026-10-01', max: '2026-10-31' },
    testId: 'p04',
  })
  assert.match(
    html,
    /<a href="\/cal\?range=day&amp;date=2026-11-26" class="[^"]*" data-replace="1" data-testid="p04-today" data-slot="button">Today<\/a>/,
  )
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*data-testid="p04-previous"><span aria-hidden="true">‹ Earlier<\/span><span class="sr-only">previous day<\/span><\/button>/,
  )
  assert.match(html, /href="\/cal\?range=day&amp;date=2026-10-02"[^>]*data-testid="p04-next"/)
  assert.match(html, /data-testid="p04-range">Thursday, October 1<\/p>/)
})

test('an extra tab has no arrows and no heading; a class joins the row', () => {
  const html = render({ range: 'upcoming', before: [{ id: 'upcoming', label: 'Upcoming' }], className: 'mt-2' })
  assert.match(html, /aria-current="page" data-testid="calendar-range-view-upcoming" data-slot="button">Upcoming</)
  assert.doesNotMatch(html, /calendar-range-previous|calendar-range-next|calendar-range-today|calendar-range-range/)
  assert.match(html, /^<div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2"/)
})

function Probe({ query }) {
  return h('span', null, String(useWideCalendar(query)))
}

test('useWideCalendar: the server and the first render assume a wide screen, with or without a window', () => {
  assert.equal(renderToStaticMarkup(h(Probe)), '<span>true</span>')
  const saved = globalThis.window
  try {
    globalThis.window = {}
    assert.equal(renderToStaticMarkup(h(Probe)), '<span>true</span>')
    globalThis.window = {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    }
    assert.equal(renderToStaticMarkup(h(Probe, { query: '(min-width: 1024px)' })), '<span>true</span>')
  } finally {
    globalThis.window = saved
  }
})
