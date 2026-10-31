// `CalendarList` of `@vereino/ui` rendered through the app's own Jest setup (foundation II P-23, DD-G08): the empty
// state, day headings, time ranges in the club zone, the cancelled strike-through and the action buttons.
import { describe, expect, it } from '@jest/globals'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CalendarDay, CalendarItem } from '@vereino/core'
import { CalendarList, formatDayHeading, type CalendarListProps, type MemberLinkProps } from '@vereino/ui'

const labels = { empty: 'No classes in this period', done: 'Done', cancelled: 'Cancelled' }
const Link = (p: MemberLinkProps) => (
  <a href={p.href} className={p.className}>
    {p.children}
  </a>
)

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: 'occ-1',
    title: 'Training',
    startsAt: new Date('2026-11-03T16:00:00Z'),
    endsAt: new Date('2026-11-03T17:30:00Z'),
    status: 'planned',
    ...overrides,
  }
}
const days = (...items: CalendarItem[]): CalendarDay[] => [{ date: '2026-11-03', items }]

function render(props: Partial<CalendarListProps> & Pick<CalendarListProps, 'days'>) {
  return renderToStaticMarkup(<CalendarList locale="pl" timeZone="Europe/Warsaw" labels={labels} {...props} />)
}

describe('CalendarList', () => {
  it('renders the empty state when there are no days', () => {
    expect(render({ days: [] })).toBe(
      '<p class="text-muted-foreground text-sm" data-testid="calendar-empty">No classes in this period</p>',
    )
  })

  it('renders the day heading, the time range in the club zone and the title', () => {
    const html = render({ days: days(item()) })
    expect(html).toContain(`<h2 class="text-sm font-semibold">${formatDayHeading('2026-11-03', 'pl')}</h2>`)
    expect(html).toContain('<time dateTime="2026-11-03T16:00:00.000Z">17:00–18:30</time>')
    expect(html).toContain('<p class="font-semibold">Training</p>')
    expect(html).not.toContain('Done')
  })

  it('strikes a cancelled title through and shows the Cancelled badge; a done item is muted with Done', () => {
    const cancelled = render({ days: days(item({ status: 'cancelled' })) })
    expect(cancelled).toContain('<p class="font-semibold line-through">Training</p>')
    expect(cancelled).toContain('>Cancelled</div>')
    const done = render({ days: days(item({ status: 'done' })) })
    expect(done).toContain('<p class="font-semibold text-muted-foreground">Training</p>')
    expect(done).toContain('>Done</div>')
  })

  it('links the title when a link component and an href are given', () => {
    const html = render({ days: days(item({ href: '/club/sessions/occ-1' })), Link })
    expect(html).toContain(
      '<a href="/club/sessions/occ-1" class="font-semibold focus-visible:shadow-focus rounded-sm outline-none">Training</a>',
    )
  })

  it('renders the actions as buttons and disables them while the item is busy', () => {
    const actions = [{ id: 'absent', label: 'Report absence', tone: 'destructive' as const }]
    const idle = render({ days: days(item({ actions })) })
    expect(idle).toMatch(/<button[^>]*data-action-id="absent">Report absence<\/button>/)
    expect(idle).not.toContain('disabled=""')
    const busy = render({ days: days(item({ actions })), busyItemId: 'occ-1' })
    expect(busy).toMatch(/<button[^>]*disabled=""[^>]*data-action-id="absent">/)
  })
})
