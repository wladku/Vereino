// Pure helpers of the member calendar (foundation II DD-G08, P-23): the day heading and the time range in the club
// zone, the tone of an item per status and the mapping of core tones to the platform's `StatusBadge` and `Button`
// variants. Framework-free so `node --test` covers every branch; `CalendarList` only renders what these return.
import type { CalendarBadgeTone, CalendarDate, CalendarItemAction, CalendarItemStatus } from '@vereino/core'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { ChartLegendColor } from '@open-mercato/ui/primitives/chart-legend'

/** How an item renders by status: `planned` neutral, `done` muted, `cancelled` struck through with the error tone. */
export type CalendarItemTone = {
  readonly badge: 'neutral' | 'success' | 'error'
  readonly muted: boolean
  readonly strike: boolean
}

const ITEM_TONES: Record<CalendarItemStatus, CalendarItemTone> = {
  planned: { badge: 'neutral', muted: false, strike: false },
  done: { badge: 'success', muted: true, strike: false },
  cancelled: { badge: 'error', muted: false, strike: true },
}

export function calendarItemTone(status: CalendarItemStatus): CalendarItemTone {
  return ITEM_TONES[status]
}

/** Weekday, day and month of a club-zone date (`YYYY-MM-DD`), e.g. "Tuesday, March 3" or "wtorek, 3 marca". */
export function formatDayHeading(date: CalendarDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

/** `HH:mm–HH:mm` (en dash) in the club zone, 24-hour clock whatever the locale. */
export function formatTimeRange(startsAt: Date, endsAt: Date, locale: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return `${time.format(startsAt)}–${time.format(endsAt)}`
}

const BADGE_VARIANTS: Record<CalendarBadgeTone, StatusBadgeVariant> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
}

/** The `StatusBadge` variant of a core badge tone (the two sets agree today; the map keeps a divergence visible). */
export function badgeVariant(tone: CalendarBadgeTone): StatusBadgeVariant {
  return BADGE_VARIANTS[tone]
}

export type CalendarActionVariant = 'default' | 'destructive' | 'outline'

/** The `Button` variant of an action tone: `primary` filled, `destructive` quiet red, everything else outlined. */
export function actionButtonVariant(tone: CalendarItemAction['tone']): CalendarActionVariant {
  if (tone === 'primary') return 'default'
  if (tone === 'destructive') return 'destructive'
  return 'outline'
}

/** The status badge text: "Done" and "Cancelled" from the labels; a planned item shows no status badge. */
export function calendarStatusLabel(
  status: CalendarItemStatus,
  labels: { readonly done: string; readonly cancelled: string },
): string | null {
  if (status === 'done') return labels.done
  if (status === 'cancelled') return labels.cancelled
  return null
}

/** Title classes per tone: struck through when cancelled, muted when done. */
export function calendarTitleClassName(tone: CalendarItemTone): string {
  return ['font-semibold', tone.strike ? 'line-through' : null, tone.muted ? 'text-muted-foreground' : null]
    .filter((className) => className !== null)
    .join(' ')
}

/**
 * The platform legend colours a section marker takes (the `ChartLegendDot` palette on design tokens, both schemes),
 * blue first; grey is left out so a marker never reads as "disabled". The colour only repeats the section's name, which
 * is always written next to it.
 */
export const SECTION_MARKER_COLORS: readonly ChartLegendColor[] = [
  'blue',
  'purple',
  'teal',
  'pink',
  'orange',
  'sky',
  'green',
  'yellow',
  'red',
]

/** A stable 32-bit FNV-1a hash of a section id: the slot it prefers in the palette. */
export function sectionMarkerSlot(sectionId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < sectionId.length; index += 1) {
    hash ^= sectionId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % SECTION_MARKER_COLORS.length
}

/**
 * The marker colour of each section shown together: a section keeps the colour its id prefers in every week and month,
 * and when two sections on screen prefer the same one, the later id (in id order) takes the next free colour. Past nine
 * sections the colours repeat; the names keep them apart.
 */
export function sectionMarkerColors(sectionIds: readonly string[]): Map<string, ChartLegendColor> {
  const colors = new Map<string, ChartLegendColor>()
  const taken = new Set<number>()
  for (const id of [...new Set(sectionIds)].sort((a, b) => a.localeCompare(b))) {
    let slot = sectionMarkerSlot(id)
    if (taken.size < SECTION_MARKER_COLORS.length) {
      while (taken.has(slot)) slot = (slot + 1) % SECTION_MARKER_COLORS.length
      taken.add(slot)
    }
    colors.set(id, SECTION_MARKER_COLORS[slot] as ChartLegendColor)
  }
  return colors
}
