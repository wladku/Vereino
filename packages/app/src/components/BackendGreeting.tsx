'use client'
// The greeting of the panel dashboard (README B-01; navigation spec REQ-N04; #260): "Hello, {first name}" and
// "{date} · what needs action today" above the platform `DashboardScreen`. Without a linked person the greeting has no
// name; while the person loads a skeleton line keeps the place.
import * as React from 'react'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useStaffPerson } from '@/components/use-staff-person'

export function BackendGreeting() {
  const t = useT()
  const locale = useLocale()
  const { person, loading } = useStaffPerson()
  const date = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(),
      ),
    [locale],
  )
  return (
    <header className="space-y-1" data-testid="backend-greeting">
      {loading ? (
        <div className="bg-muted h-8 w-64 animate-pulse rounded-md" aria-hidden="true" />
      ) : (
        <p className="text-2xl font-semibold tracking-tight" data-testid="backend-greeting-title">
          {person ? t('vereino.dashboard.greeting', { name: person.firstName }) : t('vereino.dashboard.greetingNoName')}
        </p>
      )}
      <p className="text-muted-foreground text-sm" data-testid="backend-greeting-subtitle">
        {t('vereino.dashboard.subtitle', { date })}
      </p>
    </header>
  )
}
