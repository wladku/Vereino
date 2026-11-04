// The member calendar list (foundation II DD-G08, P-23; REQ-G06; E06-S18): a legend of the sections present, then one
// section per club-zone day, one card per item with its time range, status badge, section marker (a coloured dot and
// the section's name — never colour alone), title, place, group, coach, badges and actions. Tailwind on the platform's
// tokens, a single column at 375 px; the module decides what an action id means and passes the labels, the link
// component and the empty state's action.
import * as React from 'react'
import { calendarSections, type CalendarDay, type CalendarItem } from '@vereino/core'
import { Button } from '@open-mercato/ui/primitives/button'
import { ChartLegend, ChartLegendDot, type ChartLegendColor } from '@open-mercato/ui/primitives/chart-legend'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import {
  actionButtonVariant,
  badgeVariant,
  calendarItemTone,
  calendarStatusLabel,
  calendarTitleClassName,
  formatDayHeading,
  formatTimeRange,
  sectionMarkerColors,
} from '#src/member/calendar-format'
import type { MemberLinkProps } from '#tsx/member/member-shell'

export type CalendarListLabels = {
  empty: string
  done: string
  cancelled: string
  /** The accessible name of the section legend; without it no legend renders. */
  sections?: string
  /** The word before the coach's name ("Coach"); without it the name stands alone. */
  coach?: string
}

export type CalendarListProps = {
  days: readonly CalendarDay[]
  locale: string
  timeZone: string
  labels: CalendarListLabels
  Link?: React.ComponentType<MemberLinkProps>
  onAction?: (itemId: string, actionId: string) => void
  busyItemId?: string | null
  /** Shown under the empty message (for example "Next week"). */
  emptyAction?: React.ReactNode
  className?: string
}

type ItemProps = Pick<CalendarListProps, 'locale' | 'timeZone' | 'labels' | 'Link' | 'onAction' | 'busyItemId'> & {
  item: CalendarItem
  sectionColor?: ChartLegendColor
}

function CalendarListItem({ item, locale, timeZone, labels, Link, onAction, busyItemId, sectionColor }: ItemProps) {
  const tone = calendarItemTone(item.status)
  const statusLabel = calendarStatusLabel(item.status, labels)
  const titleClassName = calendarTitleClassName(tone)
  const actions = item.actions ?? []
  const badges = item.badges ?? []
  return (
    <li
      className="bg-card flex flex-col gap-2 rounded-lg border p-4"
      data-testid="calendar-item"
      data-item-id={item.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <time dateTime={item.startsAt.toISOString()} className={tone.muted ? 'text-muted-foreground' : undefined}>
          {formatTimeRange(item.startsAt, item.endsAt, locale, timeZone)}
        </time>
        {statusLabel !== null ? <StatusBadge variant={tone.badge}>{statusLabel}</StatusBadge> : null}
      </div>
      {item.section ? (
        <p
          className="text-muted-foreground flex items-center gap-1 text-sm"
          data-testid="calendar-item-section"
          data-section-id={item.section.id}
        >
          <ChartLegendDot color={sectionColor} />
          {item.section.label}
        </p>
      ) : null}
      {Link && item.href ? (
        <Link href={item.href} className={`${titleClassName} focus-visible:shadow-focus rounded-sm outline-none`}>
          {item.title}
        </Link>
      ) : (
        <p className={titleClassName}>{item.title}</p>
      )}
      {item.subtitle ? <p className="text-muted-foreground text-sm">{item.subtitle}</p> : null}
      {item.group ? <p className="text-muted-foreground text-sm">{item.group}</p> : null}
      {item.coach ? (
        <p className="text-muted-foreground text-sm" data-testid="calendar-item-coach">
          {labels.coach ? `${labels.coach}: ${item.coach}` : item.coach}
        </p>
      ) : null}
      {item.place ? (
        <p className="text-muted-foreground text-sm">
          {item.place}
          {item.placeAddress ? <span className="block">{item.placeAddress}</span> : null}
        </p>
      ) : null}
      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {badges.map((badge) => (
            <StatusBadge key={badge.id} variant={badgeVariant(badge.tone)}>
              {badge.label}
            </StatusBadge>
          ))}
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant={actionButtonVariant(action.tone)}
              size="sm"
              className="h-auto min-h-11 max-w-full py-2 text-left whitespace-normal"
              disabled={action.disabled === true || busyItemId === item.id}
              onClick={() => onAction?.(item.id, action.id)}
              data-action-id={action.id}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </li>
  )
}

export function CalendarList({
  days,
  locale,
  timeZone,
  labels,
  Link,
  onAction,
  busyItemId,
  emptyAction,
  className,
}: CalendarListProps) {
  if (days.length === 0) {
    const message = (
      <p className="text-muted-foreground text-sm" data-testid="calendar-empty">
        {labels.empty}
      </p>
    )
    if (!emptyAction) return message
    return (
      <div className="flex flex-col items-start gap-3">
        {message}
        {emptyAction}
      </div>
    )
  }
  const sections = calendarSections(days.flatMap((day) => day.items))
  const colors = sectionMarkerColors(sections.map((section) => section.id))
  return (
    <div className={className ? `flex flex-col gap-6 ${className}` : 'flex flex-col gap-6'}>
      {labels.sections && sections.length > 0 ? (
        <ul aria-label={labels.sections} className="flex flex-wrap gap-x-4 gap-y-2" data-testid="calendar-legend">
          {sections.map((section) => (
            <li key={section.id} data-testid="calendar-legend-section" data-section-id={section.id}>
              <ChartLegend color={colors.get(section.id)} className="text-sm">
                {section.label}
              </ChartLegend>
            </li>
          ))}
        </ul>
      ) : null}
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2" data-testid="calendar-day" data-date={day.date}>
          <h2 className="text-sm font-semibold">{formatDayHeading(day.date, locale)}</h2>
          <ul className="flex flex-col gap-2">
            {day.items.map((item) => (
              <CalendarListItem
                key={item.id}
                item={item}
                locale={locale}
                timeZone={timeZone}
                labels={labels}
                Link={Link}
                onAction={onAction}
                busyItemId={busyItemId}
                sectionColor={item.section ? colors.get(item.section.id) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
