'use client'
// "Accept cash" (UX concept README B-21, B-22, B-29; payments spec REQ-031; issue #114; payments parity DD-C03, #292):
// the shared cash form in a dialog, with "Received by me today" under it. Under 640 px it fills the screen. It opens
// with the payer chosen when the screen names one (B-22) and passes the screen as `origin` to the audit context.
// Ctrl/Cmd+Enter saves, Escape closes. The caller refreshes its screen once cash is recorded.
import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { CashOrigin } from '../lib/cash'
import { CashAcceptForm } from './cash/CashAcceptForm'
import { CashTodayList } from './cash/CashTodayList'
import type { CashRecorded } from './cash/cash-client'

export function AcceptCashDialog({
  open,
  onOpenChange,
  onDone,
  origin,
  payerPersonId,
  chargeIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (recorded: CashRecorded) => void | Promise<void>
  origin: CashOrigin
  payerPersonId?: string
  chargeIds?: readonly string[]
}) {
  const t = useT()
  const formRef = React.useRef<HTMLFormElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        className="max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
        data-testid="accept-cash-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.cash.title')}</DialogTitle>
          <DialogDescription>{t('payments.cash.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {open ? (
            <CashAcceptForm
              origin={origin}
              payerPersonId={payerPersonId}
              chargeIds={chargeIds}
              focusOnOpen
              formRef={formRef}
              onDone={onDone}
              onCancel={() => {
                onOpenChange(false)
              }}
            />
          ) : null}
          <CashTodayList />
        </div>
      </DialogContent>
    </Dialog>
  )
}
