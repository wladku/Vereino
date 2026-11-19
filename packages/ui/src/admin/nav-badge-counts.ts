// Menu counts of the panel sidebar (navigation spec REQ-N03, DD-N05; issue #260): each module that owns a number mounts
// one headless widget on the platform spot `backend:nav:badges` and publishes its counts through the platform store
// (`setNavBadge(href, badge)`). This is the one effect those widgets share: read the counts at once, then every 60
// seconds, publish a positive count with its spoken label, and nothing at zero, on a malformed value or on a failed
// read. The widget passes the platform `setNavBadge` and its API read, so this package stays free of the platform's
// client sources; the timers are injectable, so `node --test` drives the refresh directly.
import { globalTimers, type EffectCallback, type Timers } from '#src/admin/request-effect'

/** How often a mounted count widget reads its counts again (the spec's 60 seconds). */
export const NAV_BADGE_REFRESH_MS = 60_000

/** What the platform `setNavBadge` accepts: a count with its accessible label, or `null` to show nothing. */
export type NavBadgeValue = { readonly count: number; readonly label: string }

export type NavBadgePublish = (href: string, badge: NavBadgeValue | null) => void

/** The counts of one read, by menu item `href`; an item missing here shows nothing. */
export type NavBadgeCounts = Readonly<Record<string, unknown>>

/** A count taken from an API field: a non-negative integer, otherwise `null` (the read is treated as unknown). */
export function navBadgeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** The badge of one menu item: a positive count with its label, `null` for zero or an unknown count. */
export function navBadgeValue(value: unknown, label: (count: number) => string): NavBadgeValue | null {
  const count = navBadgeCount(value)
  return count !== null && count > 0 ? { count, label: label(count) } : null
}

export type NavBadgeEffectInput = {
  /** The menu items this widget owns; each is published on every read, and cleared when a read fails. */
  readonly hrefs: readonly string[]
  readonly read: () => Promise<NavBadgeCounts>
  readonly publish: NavBadgePublish
  /** The spoken label of a count ("{n} waiting"). */
  readonly label: (count: number) => string
  readonly intervalMs?: number
  readonly timers?: Timers
}

/**
 * An effect that reads the counts at once and then `intervalMs` after each answer, publishing every owned item. The
 * cleanup stops the schedule and drops an answer still in flight, so a re-run after navigation never races an older
 * read; the badges stay as they were until the new read answers, so the menu does not flicker.
 */
export function navBadgeEffect({
  hrefs,
  read,
  publish,
  label,
  intervalMs = NAV_BADGE_REFRESH_MS,
  timers = globalTimers,
}: NavBadgeEffectInput): EffectCallback {
  return () => {
    let active = true
    let handle = timers.setTimeout(run, 0)
    function run(): void {
      Promise.resolve()
        .then(read)
        .then(
          (counts) => {
            if (!active) return
            for (const href of hrefs) publish(href, navBadgeValue(counts[href], label))
          },
          () => {
            if (!active) return
            for (const href of hrefs) publish(href, null)
          },
        )
        .finally(() => {
          if (active) handle = timers.setTimeout(run, intervalMs)
        })
    }
    return () => {
      active = false
      timers.clearTimeout(handle)
    }
  }
}
