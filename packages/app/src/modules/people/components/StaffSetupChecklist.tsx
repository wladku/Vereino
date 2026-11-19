'use client'
// "Staff setup" on the Roles tab of the person record (people life-cycle spec REQ-L09, J-L07, B-10 `?tab=roles`;
// #312): one checklist for making a person a coach — Account, Role, Groups as coach, Contract — each with its state
// (`@vereino/core` `staff-setup.ts`) and a link. `people` draws the Account and Role rows; the Groups and Contract rows
// come from the injection spot `vereino:people:person-record:staff-setup`, filled by `groups` and `club_core`, so
// `people` imports neither. The Account action needs `people.accounts.manage` and the Role action
// `people.roles.manage`: a coordinator sees the states without them (the Contract row needs
// `club_core.contracts.manage`, so a coordinator does not see it at all).
import * as React from 'react'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { STAFF_STEP_VARIANT, accountStep, periodStep, type StaffStep } from '@vereino/core'
import type { PersonAccount, RoleAssignmentRow } from './client-helpers'

/** The injection spot of the checklist's module rows (`groups`, `club_core` injection tables). */
export const STAFF_SETUP_SPOT_ID = 'vereino:people:person-record:staff-setup'

function StepRow({
  testId,
  label,
  step,
  detail,
  action,
}: {
  testId: string
  label: string
  step: StaffStep
  detail?: string | null
  action?: React.ReactNode
}) {
  const t = useT()
  return (
    <div
      className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
      data-testid={testId}
      data-step={step}
    >
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{label}</span>
          <StatusBadge variant={STAFF_STEP_VARIANT[step]}>{t(`people.staffSetup.step.${step}`)}</StatusBadge>
        </span>
        {detail ? <span className="text-muted-foreground text-xs">{detail}</span> : null}
      </span>
      {action ? <span className="flex flex-wrap gap-2">{action}</span> : null}
    </div>
  )
}

export function StaffSetupChecklist({
  personId,
  account,
  roles,
  today,
  canManageAccount,
  canManageRoles,
  onOpenAccount,
  onAssignCoachRole,
}: {
  personId: string
  account: PersonAccount | null
  roles: readonly RoleAssignmentRow[]
  today: string
  canManageAccount: boolean
  canManageRoles: boolean
  onOpenAccount?: () => void
  onAssignCoachRole: () => void
}) {
  const t = useT()
  const accountState = account?.state ?? 'none'
  const periods = roles.flatMap((row) =>
    row.validFrom ? [{ role: row.role, validFrom: row.validFrom, validTo: row.validTo ?? null }] : [],
  )
  const roleStep = periodStep(periods, today)
  const activeRoles = [
    ...new Set(
      periods
        .filter((period) => periodStep([period], today) === 'done')
        .map((period) => t(`people.roles.role.${period.role}`)),
    ),
  ]
  return (
    <section
      className="flex flex-col gap-1 rounded-md border p-3"
      aria-labelledby="people-staff-setup-title"
      data-testid="people-staff-setup"
    >
      <h3 id="people-staff-setup-title" className="text-sm font-semibold">
        {t('people.staffSetup.title')}
      </h3>
      <p className="text-muted-foreground text-xs">{t('people.staffSetup.help')}</p>
      <div className="flex flex-col divide-y">
        <StepRow
          testId="people-staff-setup-account"
          label={t('people.staffSetup.account')}
          step={accountStep(accountState)}
          detail={t(`people.staffSetup.account.${accountState}`)}
          action={
            canManageAccount && onOpenAccount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="people-staff-setup-account-action"
                onClick={onOpenAccount}
              >
                {accountState === 'none' ? t('people.staffSetup.account.create') : t('people.staffSetup.account.open')}
              </Button>
            ) : null
          }
        />
        <StepRow
          testId="people-staff-setup-role"
          label={t('people.staffSetup.role')}
          step={roleStep}
          detail={activeRoles.length > 0 ? activeRoles.join(', ') : t('people.staffSetup.role.none')}
          action={
            canManageRoles ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="people-staff-setup-role-action"
                onClick={onAssignCoachRole}
              >
                {t('people.staffSetup.role.assign')}
              </Button>
            ) : null
          }
        />
        <InjectionSpot spotId={STAFF_SETUP_SPOT_ID} context={{ personId }} />
      </div>
    </section>
  )
}
