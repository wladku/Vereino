'use client'
// The tabs of B-28 "Municipality report" (navigation spec REQ-N02, A-N03; #256): the report and Rented hours, the
// second tab, so the facility group keeps six menu items. `?tab=rented-hours` on the report leads to the second tab.
import type * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RouteTab } from '@vereino/ui'
import { FacilityTabs } from './FacilityTabs'

const TABS = [
  { value: 'owner', href: '/backend/facilities/reports/owner', features: ['facilities.reports.view'], alias: 'owner' },
  {
    value: 'rented-hours',
    href: '/backend/facilities/reports/rented-hours',
    features: ['facilities.reports.view'],
    alias: 'rented-hours',
  },
] as const satisfies readonly RouteTab[]

export type FacilityReportsTab = (typeof TABS)[number]['value']

export function FacilityReportsNav({ current, children }: { current: FacilityReportsTab; children: React.ReactNode }) {
  const t = useT()
  return (
    <FacilityTabs
      tabs={TABS}
      current={current}
      label={t('facilities.reports.tabs.label')}
      labels={{
        owner: t('facilities.reports.tabs.owner'),
        'rented-hours': t('facilities.reports.tabs.rentedHours'),
      }}
    >
      {children}
    </FacilityTabs>
  )
}
