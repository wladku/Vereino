'use client'
// The tabs of B-26 "Zones and rates" (navigation spec REQ-N02; #256): Zones, Closures and Rental rates, the mockup's
// `?tab=zones|closures|rates`. The tabs keep today's features (A-N05); spec R fills their contents.
import type * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RouteTab } from '@vereino/ui'
import { FacilityTabs } from './FacilityTabs'

const TABS = [
  { value: 'zones', href: '/backend/facilities/zones', features: ['facilities.view'], alias: 'zones' },
  { value: 'closures', href: '/backend/facilities/closures', features: ['facilities.view'], alias: 'closures' },
  { value: 'rates', href: '/backend/facilities/rates', features: ['facilities.view'], alias: 'rates' },
] as const satisfies readonly RouteTab[]

export type FacilityRulesTab = (typeof TABS)[number]['value']

export function FacilityRulesNav({ current, children }: { current: FacilityRulesTab; children: React.ReactNode }) {
  const t = useT()
  return (
    <FacilityTabs
      tabs={TABS}
      current={current}
      label={t('facilities.rules.tabs.label')}
      labels={{
        zones: t('facilities.rules.tabs.zones'),
        closures: t('facilities.rules.tabs.closures'),
        rates: t('facilities.rules.tabs.rates'),
      }}
    >
      {children}
    </FacilityTabs>
  )
}
