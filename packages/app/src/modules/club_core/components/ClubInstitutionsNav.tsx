'use client'
// The tabs of B-07 "Institutions and contracts" (navigation spec REQ-N02; #256): Institutions and Contracts, the
// mockup's `?tab=inst|contracts`. Contracts needs `club_core.contracts.manage`, so a club manager without it sees no
// strip.
import type * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { RouteTab } from '@vereino/ui'
import { ClubRouteTabs } from './ClubRouteTabs'

const TABS = [
  { value: 'institutions', href: '/backend/club/institutions', features: ['club_core.manage'], alias: 'inst' },
  { value: 'contracts', href: '/backend/club/contracts', features: ['club_core.contracts.manage'], alias: 'contracts' },
] as const satisfies readonly RouteTab[]

export type ClubInstitutionsTab = (typeof TABS)[number]['value']

export function ClubInstitutionsNav({
  current,
  children,
}: {
  current: ClubInstitutionsTab
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <ClubRouteTabs
      tabs={TABS}
      current={current}
      label={t('club_core.institutions.tabs.label')}
      labels={{
        institutions: t('club_core.institutions.tabs.institutions'),
        contracts: t('club_core.institutions.tabs.contracts'),
      }}
    >
      {children}
    </ClubRouteTabs>
  )
}
