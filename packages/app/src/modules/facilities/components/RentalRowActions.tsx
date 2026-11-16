'use client'
// The status actions of one rental (facilities spec B-24; #122; #279): "Confirm payment" and "No-show" ask first and
// run at once with the rental's lock token; "Cancel" and "Move" open their dialogs. Shared by the rentals list and the
// rental page, so both refuse, refresh and announce the same way: a stale lock token opens the shared conflict
// dialog, an `invalid_transition` says the status changed meanwhile.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { CancelRentalDialog, MoveRentalDialog } from './RentalActionDialogs'
import { codedMessage, errorMessage, placeLabel, type usePlaceOptions } from './facilities-client'
import { runRentalAction, slotLabel, useRentalTimeZone, type RentalAction, type RentalRow } from './rentals-client'

type ActionDialog = { kind: 'cancel' | 'move'; row: RentalRow } | null

export function useRentalActions({
  places,
  onDone,
}: {
  places: ReturnType<typeof usePlaceOptions>
  onDone: () => Promise<void>
}): { run: (row: RentalRow, action: RentalAction) => void; element: React.ReactNode } {
  const t = useT()
  const timeZone = useRentalTimeZone()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [dialog, setDialog] = React.useState<ActionDialog>(null)

  const simpleAction = React.useCallback(
    async (row: RentalRow, action: 'confirm' | 'noShow') => {
      const confirmed = await confirm({
        title: t(`facilities.rentals.${action}.title`),
        text: t(`facilities.rentals.${action}.text`, { slot: slotLabel(row.startsAt, row.endsAt, timeZone) }),
        confirmText: t(`facilities.rentals.actions.${action}`),
        cancelText: t('facilities.rentals.actions.back'),
        variant: action === 'noShow' ? 'destructive' : 'default',
      })
      if (!confirmed) return
      const fallback = t(`facilities.rentals.errors.${action}`)
      try {
        await runRentalAction(row, action, {}, fallback)
        flash(t(`facilities.rentals.flash.${action}`), 'success')
      } catch (err: unknown) {
        if (!surfaceRecordConflict(err, t, { onRefresh: () => void onDone() })) {
          flash(
            errorCodeOf(err) === 'invalid_transition'
              ? t('facilities.rentals.errors.invalid_transition')
              : (codedMessage(err, t) ?? errorMessage(err, fallback)),
            'error',
          )
        }
      }
      await onDone()
    },
    [confirm, onDone, t, timeZone],
  )

  const run = React.useCallback(
    (row: RentalRow, action: RentalAction) => {
      if (action === 'cancel' || action === 'move') {
        setDialog({ kind: action, row })
        return
      }
      void simpleAction(row, action)
    },
    [simpleAction],
  )

  const close = (open: boolean) => {
    if (!open) setDialog(null)
  }
  const element = (
    <>
      {dialog?.kind === 'cancel' ? (
        <CancelRentalDialog
          key={`cancel-${dialog.row.id}`}
          row={dialog.row}
          placeName={placeLabel(t, places.names, dialog.row.placeId)}
          open
          onOpenChange={close}
          onDone={onDone}
        />
      ) : null}
      {dialog?.kind === 'move' ? (
        <MoveRentalDialog
          key={`move-${dialog.row.id}`}
          row={dialog.row}
          placeName={placeLabel(t, places.names, dialog.row.placeId)}
          places={places.options}
          open
          onOpenChange={close}
          onDone={onDone}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
  return { run, element }
}
