'use client'
// `/club/cash` — M-15 "Accept cash" on a phone (UX concept M-15; payments spec UI row, REQ-031; issue #114): the shared
// cash form (payer, charges, amount, date, e-mail confirmation) naming the signed-in receiver before saving, and
// "Received by me today" listing what each receipt paid for with the total to hand over to the treasurer (REQ-C12,
// #300), in the member shell.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { personName } from '../client-helpers'
import { CashAcceptForm } from '../cash/CashAcceptForm'
import { CashTodayList } from '../cash/CashTodayList'
import { PaymentsClubFrame } from './PaymentsClubFrame'

export function ClubCashPage() {
  const t = useT()
  return (
    <PaymentsClubFrame payerOnly={false}>
      {(profile) => (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{t('payments.cash.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('payments.cash.help')}</p>
          </div>
          <CashAcceptForm origin="phone" receiverName={personName(profile.person)} />
          <CashTodayList />
        </div>
      )}
    </PaymentsClubFrame>
  )
}
