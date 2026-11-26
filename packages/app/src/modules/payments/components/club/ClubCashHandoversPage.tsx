'use client'
// `/club/cash-handovers` — M-18a "Handovers to confirm" on a phone (payments spec UI row, REQ-033a, J-010a step 2;
// D-042, #791): the treasurer or the club administrator counts the cash a collector brought and confirms the whole
// handover or rejects it with the difference, in the member shell. Reached from the Today row "Handovers to confirm".
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PendingHandovers } from '../cash-custody/PendingHandovers'
import { PaymentsClubFrame } from './PaymentsClubFrame'

export function ClubCashHandoversPage() {
  const t = useT()
  return (
    <PaymentsClubFrame payerOnly={false}>
      {() => <PendingHandovers headingLevel={1} emptyText={t('payments.cashHandovers.empty')} />}
    </PaymentsClubFrame>
  )
}
