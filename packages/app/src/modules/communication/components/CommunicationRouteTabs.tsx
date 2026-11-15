'use client'
// The shell of B-18 "Threads and cases" (navigation spec REQ-N02, DD-N02; issue #256), in the pattern of
// `groups/components/GroupsNav.tsx`. Each tab is its own route, so a tab change navigates and the URL stays shareable. A
// tab the person may not open is not rendered (the route keeps its 403), a strip with one visible tab is not rendered,
// and `?tab=` of the mockup on the first route leads to the tab's route (rules in `@vereino/ui` `route-tabs-model`).
// The content sits in one element whether the strip shows or not, so the strip appearing after the feature check never
// remounts the list; with the strip it is the selected tab's panel. A module copy of `facilities/components/FacilityTabs`
// (modules do not import each other's components). The strip itself is `ThreadsNav`.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, useTabsContext } from '@open-mercato/ui/primitives/tabs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  routeTabAliasHref,
  routeTabChangeHref,
  routeTabFeatures,
  showsRouteTabStrip,
  visibleRouteTabs,
  type RouteTab,
} from '@vereino/ui'

export function CommunicationRouteTabs<Value extends string>({
  tabs,
  current,
  label,
  labels,
  children,
}: {
  tabs: readonly RouteTab<Value>[]
  current: Value
  label: string
  labels: { readonly [value in Value]: string }
  children: React.ReactNode
}) {
  const router = useRouter()
  const alias = useSearchParams().get('tab')
  const aliasHref = current === tabs[0]?.value ? routeTabAliasHref(tabs, alias) : null
  React.useEffect(() => {
    if (aliasHref) router.replace(aliasHref)
  }, [aliasHref, router])
  const features = routeTabFeatures(tabs)
  const granted = useQuery({
    queryKey: ['feature-check', ...features],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  const visible = visibleRouteTabs(tabs, current, granted.data ?? null)
  const strip = showsRouteTabStrip(visible)
  return (
    <Tabs
      value={current}
      variant="underline"
      onValueChange={(value: string) => {
        const href = routeTabChangeHref(visible, current, value)
        if (href) router.push(href)
      }}
    >
      {strip ? (
        <div className="overflow-x-auto">
          <TabsList aria-label={label}>
            {visible.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {labels[tab.value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      ) : null}
      <TabPanel value={current} strip={strip}>
        {children}
      </TabPanel>
    </Tabs>
  )
}

// The platform `TabsContent` markup (ids from the `Tabs` context), but always the same element.
function TabPanel({ value, strip, children }: { value: string; strip: boolean; children: React.ReactNode }) {
  const { baseId } = useTabsContext()
  const key = encodeURIComponent(value)
  const panel = strip
    ? {
        role: 'tabpanel',
        id: baseId && `${baseId}-panel-${key}`,
        'aria-labelledby': baseId && `${baseId}-tab-${key}`,
        tabIndex: 0,
      }
    : {}
  return (
    <div
      {...panel}
      className={
        strip
          ? 'ring-offset-background focus-visible:ring-ring pt-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
          : undefined
      }
    >
      {children}
    </div>
  )
}
