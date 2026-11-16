'use client'
// "Accept cash" as one element a screen mounts (payments parity DD-C03, REQ-C02; #292): the button and the shared
// dialog. B-21 and B-29 open it empty and keep it open for the next payer; B-22 opens it with the charge's payer chosen
// and closes it once the cash is recorded. `onDone` refreshes the screen it was opened from.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { CashOrigin } from '../lib/cash'
import { AcceptCashDialog } from './AcceptCashDialog'
import type { CashRecorded } from './cash/cash-client'

export function AcceptCashButton({
  origin,
  payerPersonId,
  chargeIds,
  onDone,
  variant = 'outline',
}: {
  origin: CashOrigin
  payerPersonId?: string
  chargeIds?: readonly string[]
  onDone?: (recorded: CashRecorded) => void | Promise<void>
  variant?: 'default' | 'outline'
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        data-testid="accept-cash-open"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('payments.cash.action')}
      </Button>
      <AcceptCashDialog
        open={open}
        onOpenChange={setOpen}
        origin={origin}
        payerPersonId={payerPersonId}
        chargeIds={chargeIds}
        onDone={async (recorded) => {
          if (payerPersonId) setOpen(false)
          await onDone?.(recorded)
        }}
      />
    </>
  )
}
