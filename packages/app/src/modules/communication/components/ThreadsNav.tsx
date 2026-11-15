'use client'
// The tabs of B-18 "Threads and cases" (navigation spec REQ-N02; #256): All threads and Cases, `?tab=cases` on the
// threads list. Cases needs `communication.cases.manage`, so a coach without it sees no strip.
import type * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RouteTab } from '@vereino/ui'
import { CommunicationRouteTabs } from './CommunicationRouteTabs'

const TABS = [
  { value: 'all', href: '/backend/communication/threads', features: ['communication.post'], alias: 'all' },
  { value: 'cases', href: '/backend/communication/cases', features: ['communication.cases.manage'], alias: 'cases' },
] as const satisfies readonly RouteTab[]

export type ThreadsTab = (typeof TABS)[number]['value']

export function ThreadsNav({ current, children }: { current: ThreadsTab; children: React.ReactNode }) {
  const t = useT()
  return (
    <CommunicationRouteTabs
      tabs={TABS}
      current={current}
      label={t('communication.threads.tabs.label')}
      labels={{
        all: t('communication.threads.tabs.all'),
        cases: t('communication.threads.tabs.cases'),
      }}
    >
      {children}
    </CommunicationRouteTabs>
  )
}
