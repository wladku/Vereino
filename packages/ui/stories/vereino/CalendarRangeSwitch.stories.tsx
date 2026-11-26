// The shared Day / Week / Month switch of every calendar (calendar range switch spec REQ-W02, DD-W01): links that
// change the story's own state instead of the address, in Week, Day at the window's edge, and with M-03's extra tab.
import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { CalendarRangeSwitch, type CalendarRangeLinkProps } from '../../src/member/calendar-range-switch'

type Args = { range: string; anchor: string; min?: string; upcoming?: boolean }

function Demo({ range: initialRange, anchor: initialAnchor, min, upcoming }: Args) {
  const t = useT()
  const locale = useLocale()
  const [state, setState] = React.useState({ range: initialRange, anchor: initialAnchor })
  const Link = React.useCallback(({ href, className, children, ...rest }: CalendarRangeLinkProps) => {
    const params = new URLSearchParams(href.split('?')[1] ?? '')
    return (
      <a
        href={href}
        className={className}
        data-testid={rest['data-testid']}
        aria-current={rest['aria-current']}
        onClick={(event) => {
          event.preventDefault()
          setState({ range: params.get('range') ?? 'week', anchor: params.get('date') ?? initialAnchor })
        }}
      >
        {children}
      </a>
    )
  }, [initialAnchor])
  const ranges = ['day', 'week', 'month'] as const
  return (
    <CalendarRangeSwitch
      range={state.range}
      anchor={state.anchor}
      today="2026-11-26"
      locale={locale}
      labels={{
        group: t('stories.range.group'),
        day: t('stories.range.day'),
        week: t('stories.range.week'),
        month: t('stories.range.month'),
        earlier: t('stories.range.earlier'),
        later: t('stories.range.later'),
        today: t('stories.range.today'),
        previous: Object.fromEntries(ranges.map((r) => [r, t(`stories.range.previous.${r}`)])) as Record<(typeof ranges)[number], string>,
        next: Object.fromEntries(ranges.map((r) => [r, t(`stories.range.next.${r}`)])) as Record<(typeof ranges)[number], string>,
      }}
      hrefFor={(range, anchor) => `?range=${range}&date=${anchor}`}
      Link={Link}
      before={upcoming ? [{ id: 'upcoming', label: t('stories.range.upcoming') }] : []}
      limits={min ? { min } : undefined}
    />
  )
}

const meta = {
  title: 'Vereino/CalendarRangeSwitch',
  component: Demo,
  args: { range: 'week', anchor: '2026-11-26' },
} satisfies Meta<typeof Demo>

export default meta
type Story = StoryObj<typeof meta>

export const Week: Story = {}

// "Earlier" is disabled at the first day the view may read; "Today" leads back from another day.
export const DayAtTheEdge: Story = { args: { range: 'day', anchor: '2026-10-01', min: '2026-10-01' } }

// M-03: "Upcoming" before Day / Week / Month, without arrows.
export const WithUpcoming: Story = { args: { range: 'upcoming', anchor: '2026-11-26', upcoming: true } }
