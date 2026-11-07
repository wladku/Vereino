'use client'
// "Accept cash" of B-21 (UX concept README B-21; payments spec REQ-031; issue #114): the shared cash form in a dialog
// on the charges list, with "Received by me today" under it. The caller refreshes the list once cash is recorded.
import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CashAcceptForm } from './cash/CashAcceptForm'
import { CashTodayList } from './cash/CashTodayList'

export function AcceptCashDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('payments.common.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('payments.cash.title')}</DialogTitle>
          <DialogDescription>{t('payments.cash.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {open ? (
            <CashAcceptForm
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
