'use client'
// "Add place" on the club event form of the panel (club events spec REQ-T06, UI row B-T2; #378): `activities`' form
// renders the spot `vereino:activities:club-event-form:add-place` with the dialog's state and callbacks as its
// context, and this widget draws `AddExternalPlaceDialog` there — so `activities` never imports `club_core`. The phone
// form (`/club/club-events/*`, E14-S05 #380) passes `surface: 'sheet'` and gets `AddExternalPlaceSheet` instead.
import { AddExternalPlaceDialog, type AddExternalPlaceProps } from '../../../components/AddExternalPlaceDialog'
import { AddExternalPlaceSheet } from '../../../components/AddExternalPlaceSheet'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'

/** What the club event form passes as the spot context: the dialog's own props. */
export type AddExternalPlaceContext = Partial<AddExternalPlaceProps> & {
  /** `sheet` on the phone pages (a bottom sheet), the dialog otherwise. */
  surface?: 'dialog' | 'sheet'
}

export default function AddExternalPlaceWidget({
  context,
}: InjectionWidgetComponentProps<AddExternalPlaceContext, Record<string, unknown>>) {
  const { open, onOpenChange, onAdded, onPickExisting, initialName, surface } = context
  if (!onOpenChange || !onAdded) return null
  const Surface = surface === 'sheet' ? AddExternalPlaceSheet : AddExternalPlaceDialog
  return (
    <Surface
      open={open === true}
      onOpenChange={onOpenChange}
      onAdded={onAdded}
      onPickExisting={onPickExisting}
      initialName={initialName}
    />
  )
}
