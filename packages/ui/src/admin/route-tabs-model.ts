// The rules of an admin page with tabs where every tab is its own route (navigation spec REQ-N02, DD-N02): which tabs
// the signed-in person sees and where a mockup-style `?tab=` alias on the first route leads. The tabs only mirror the
// routes' own `requireFeatures`; a tab route opened by URL keeps the platform's 403. The strips themselves render the
// platform `Tabs` inside the app modules (`ClubInstitutionsNav`, `ThreadsNav`, `FacilityTabs`): this package's
// stricter typecheck cannot load the platform `tabs.tsx` source.
import { hasAllFeatures } from '@open-mercato/shared/lib/auth/featureMatch'

export type RouteTab<Value extends string = string> = {
  readonly value: Value
  readonly href: string
  /** The `requireFeatures` of the tab's route. */
  readonly features: readonly string[]
  /** The mockup's `?tab=` value that leads to this tab from the first route. */
  readonly alias: string
}

/** Every feature the tabs need, once each, for one feature check. */
export function routeTabFeatures(tabs: readonly RouteTab[]): string[] {
  return [...new Set(tabs.flatMap((tab) => tab.features))]
}

/**
 * The tabs the person may open, in their order. The current tab always stays (its route already let the person in);
 * while the granted features are unknown (`null`) only the current tab is returned, so no strip flashes up with tabs
 * that would answer 403.
 */
export function visibleRouteTabs<Value extends string>(
  tabs: readonly RouteTab<Value>[],
  current: Value,
  granted: readonly string[] | null,
): RouteTab<Value>[] {
  return tabs.filter(
    (tab) => tab.value === current || (granted !== null && hasAllFeatures([...tab.features], [...granted])),
  )
}

/**
 * Where `?tab=<alias>` on the first tab's route leads: the matching tab's route, or `null` when the alias is missing,
 * unknown (matched against the fixed list only) or names the first tab itself.
 */
export function routeTabAliasHref(tabs: readonly RouteTab[], alias: string | null): string | null {
  if (!alias) return null
  const tab = tabs.find((entry) => entry.alias === alias)
  return tab && tab !== tabs[0] ? tab.href : null
}

/** Whether the tab strip shows: only with two or more visible tabs. */
export function showsRouteTabStrip(visible: readonly RouteTab[]): boolean {
  return visible.length > 1
}

/**
 * Which visible tab a tab change leads to: its route, or `null` for the current tab or a value that is not a visible
 * tab (so a hidden tab can never be navigated to through the strip).
 */
export function routeTabChangeHref(visible: readonly RouteTab[], current: string, value: string): string | null {
  const tab = visible.find((entry) => entry.value === value)
  return tab && tab.value !== current ? tab.href : null
}
