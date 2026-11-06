'use client'
// The tabs of B-20 "Fees and discounts" (UX concept README B-20; issue #108): Fees, Discounts and the "Coaches and
// payments" setting. Each tab is its own page, so a tab change navigates and the URL stays shareable.
import type * as React from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DISCOUNTS_HREF, FEES_HREF, PAYMENT_SETTINGS_HREF } from './client-helpers'

const TABS = [
  { value: 'fees', href: FEES_HREF, labelKey: 'payments.nav.tabs.fees' },
  { value: 'discounts', href: DISCOUNTS_HREF, labelKey: 'payments.nav.tabs.discounts' },
  { value: 'settings', href: PAYMENT_SETTINGS_HREF, labelKey: 'payments.nav.tabs.settings' },
] as const

export type PaymentsTab = (typeof TABS)[number]['value']

export function PaymentsNav({ current, children }: { current: PaymentsTab; children: React.ReactNode }) {
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
        <TabsList aria-label={t('payments.nav.tabs.label')}>
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
