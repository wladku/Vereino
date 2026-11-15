'use client'
// The tabs of B-27 "Log and incidents" (navigation spec REQ-N02, A-N03; #256): Log, Incidents, Entry bans and
// Maintenance, the mockup's `?tab=logs|incidents|bans|maint`. Each tab keeps its route's feature; spec R fills their
// contents.
import type * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RouteTab } from '@vereino/ui'
import { FacilityTabs } from './FacilityTabs'

const TABS = [
  { value: 'logs', href: '/backend/facilities/logs', features: ['facilities.log.write'], alias: 'logs' },
  { value: 'incidents', href: '/backend/facilities/incidents', features: ['facilities.log.write'], alias: 'incidents' },
  { value: 'bans', href: '/backend/facilities/bans', features: ['facilities.incidents.manage'], alias: 'bans' },
  {
    value: 'maintenance',
    href: '/backend/facilities/maintenance',
    features: ['facilities.maintenance.manage'],
    alias: 'maint',
  },
] as const satisfies readonly RouteTab[]

export type FacilityRecordsTab = (typeof TABS)[number]['value']

export function FacilityRecordsNav({ current, children }: { current: FacilityRecordsTab; children: React.ReactNode }) {
  const t = useT()
  return (
    <FacilityTabs
      tabs={TABS}
      current={current}
      label={t('facilities.records.tabs.label')}
      labels={{
        logs: t('facilities.records.tabs.logs'),
        incidents: t('facilities.records.tabs.incidents'),
        bans: t('facilities.records.tabs.bans'),
        maintenance: t('facilities.records.tabs.maintenance'),
      }}
    >
      {children}
    </FacilityTabs>
  )
}
