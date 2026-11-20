'use client'
// "Add place" in the panel (club events spec REQ-T06, UI row B-T2; #377): a dialog the club event form opens from its
// place picker (E14-S03). It adds a missing venue as an external place through `useAddExternalPlace`; the host selects
// the answered place, the polite live region next to the dialog announces it, and a place with the same name and
// address is offered for picking. Cmd/Ctrl+Enter saves, Escape closes.
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AddExternalPlaceFields } from './AddExternalPlaceFields'
import { useAddExternalPlace, type AddedExternalPlace } from './useAddExternalPlace'
import { DialogContent } from '@/components/ui/dialog'

export type { AddedExternalPlace } from './useAddExternalPlace'

export type AddExternalPlaceProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The host's place picker selects the added place. */
  onAdded: (place: AddedExternalPlace) => void | Promise<void>
  /** The host's place picker selects the place already on the list (409 `external_place_exists`). */
  onPickExisting?: (placeId: string) => void | Promise<void>
  /** What the user typed in the place picker. */
  initialName?: string
}

export function AddExternalPlaceDialog(props: AddExternalPlaceProps) {
  const t = useT()
  const state = useAddExternalPlace(props)
  return (
    <>
      <p className="sr-only" aria-live="polite" role="status" data-testid="add-external-place-announcement">
        {state.announcement}
      </p>
      <Dialog open={props.open} onOpenChange={state.close}>
        <DialogContent
          closeAriaLabel={t('club_core.externalPlace.close')}
          data-testid="add-external-place-dialog"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void state.submit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('club_core.externalPlace.title')}</DialogTitle>
            <DialogDescription>{t('club_core.externalPlace.description')}</DialogDescription>
          </DialogHeader>
          <AddExternalPlaceFields state={state} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={state.pending}
              onClick={() => {
                state.close(false)
              }}
            >
              {t('club_core.externalPlace.cancel')}
            </Button>
            <Button
              type="button"
              data-testid="add-external-place-submit"
              disabled={state.pending}
              onClick={() => void state.submit()}
            >
              {t(state.pending ? 'club_core.externalPlace.saving' : 'club_core.externalPlace.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
