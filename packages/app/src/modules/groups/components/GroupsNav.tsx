'use client'
// The tabs of the groups list (club spec UI table: "tabs External teams and Seasons" of `/backend/groups/groups`): each
// tab is its own page, so a tab change navigates and the URL stays shareable. The page content is the active tab's
// panel, so the selected tab's `aria-controls` points at it.
import type * as React from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EXTERNAL_TEAMS_HREF, GROUPS_HREF, SEASONS_HREF } from './client-helpers'

const TABS = [
  { value: 'groups', href: GROUPS_HREF, labelKey: 'groups.nav.tabs.groups' },
  { value: 'seasons', href: SEASONS_HREF, labelKey: 'groups.nav.tabs.seasons' },
  { value: 'external-teams', href: EXTERNAL_TEAMS_HREF, labelKey: 'groups.nav.tabs.externalTeams' },
] as const

export type GroupsTab = (typeof TABS)[number]['value']

export function GroupsNav({ current, children }: { current: GroupsTab; children: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  return (
    <Tabs
      value={current}
      variant="underline"
      onValueChange={(value: string) => {
        const tab = TABS.find((entry) => entry.value === value)
        if (tab && tab.value !== current) router.push(tab.href)
      }}
    >
      <div className="overflow-x-auto">
        <TabsList aria-label={t('groups.nav.tabs.label')}>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={current} className="pt-4">
        {children}
      </TabsContent>
    </Tabs>
  )
}
