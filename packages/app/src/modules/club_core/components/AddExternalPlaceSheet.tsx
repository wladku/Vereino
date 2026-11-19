'use client'
// "Add place" on the phone (club events spec REQ-T06, UI row `/club/club-events/*`; #377): the bottom sheet the
// member club event form opens from its place picker (E14-S05), with the panel dialog's fields and save
// (`useAddExternalPlace`) and full-width buttons with 44 px targets. The host selects the answered place and the
// polite live region next to the sheet announces it; a place with the same name and address is offered for picking.
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { AddExternalPlaceProps } from './AddExternalPlaceDialog'
import { AddExternalPlaceFields } from './AddExternalPlaceFields'
import { useAddExternalPlace } from './useAddExternalPlace'

export function AddExternalPlaceSheet(props: AddExternalPlaceProps) {
  const t = useT()
  const state = useAddExternalPlace(props)
  return (
    <>
      <p className="sr-only" aria-live="polite" role="status" data-testid="add-external-place-announcement">
        {state.announcement}
      </p>
      <Sheet open={props.open} onOpenChange={state.close}>
        <SheetContent
          side="bottom"
          className="max-h-dvh rounded-t-xl"
          closeLabel={t('club_core.externalPlace.close')}
          data-testid="add-external-place-sheet"
        >
          <SheetHeader>
            <SheetTitle>{t('club_core.externalPlace.title')}</SheetTitle>
            <SheetDescription>{t('club_core.externalPlace.description')}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-2">
            <AddExternalPlaceFields state={state} />
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={state.pending}
              onClick={() => {
                state.close(false)
              }}
            >
              {t('club_core.externalPlace.cancel')}
            </Button>
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              data-testid="add-external-place-submit"
              disabled={state.pending}
              onClick={() => void state.submit()}
            >
              {t(state.pending ? 'club_core.externalPlace.saving' : 'club_core.externalPlace.submit')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
