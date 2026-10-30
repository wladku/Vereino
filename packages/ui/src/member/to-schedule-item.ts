// Adapter from the shared `CalendarItem` to the installed schedule family's `ScheduleItem` (foundation II DD-G09):
// the coordinator's `ScheduleView` is a planning view, so `planned` and `done` share the `confirmed` tone and only
// `cancelled` differs; `kind` is always `event` and `color` is never set (the family never reads it).
import type { CalendarItem, CalendarItemStatus } from '@vereino/core'
// The family's `types` file, not its index: the index exports `ScheduleView`, whose graph (next/dynamic,
// react-big-calendar, CrudForm, …) this package neither installs nor type-checks.
import type { ScheduleItem } from '@open-mercato/ui/backend/schedule/types'

type ScheduleStatus = NonNullable<ScheduleItem['status']>

const SCHEDULE_STATUS: Record<CalendarItemStatus, ScheduleStatus> = {
  planned: 'confirmed',
  done: 'confirmed',
  cancelled: 'cancelled',
}

export function toScheduleItem(item: CalendarItem): ScheduleItem {
  return {
    id: item.id,
    kind: 'event',
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    status: SCHEDULE_STATUS[item.status],
    linkHref: item.href ?? undefined,
    metadata: { group: item.group ?? null, place: item.place ?? null, status: item.status },
  }
}
