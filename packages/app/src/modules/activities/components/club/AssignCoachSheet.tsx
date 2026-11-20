'use client'
// "Assign substitute" / "Change coach" on the phone (README M-04; groups and activities parity spec REQ-A10, J-A04
// steps 1–2; E10-S08 #273): a bottom sheet with the panel dialog's picker (`useAssignCoach`) — a search over the names,
// the free coaches first, a busy one disabled with "Busy: {session}", an optional reason — and full-width buttons with
// 44 px targets. The save ends with the toast "{name} assigned"; a coach busy meanwhile answers the 409 with the
// collision in the sheet.
import { Button } from '@open-mercato/ui/primitives/button'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CoachPickerFields } from '../CoachPickerFields'
import { useAssignCoach, type StaffableOccurrence } from '../useAssignCoach'
import { SheetContent } from '@/components/ui/dialog'

export function AssignCoachSheet({
  occurrence,
  title,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: StaffableOccurrence
  /** "Assign a substitute — {session}" or "Change the coach — {session}", in the club's zone. */
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const picker = useAssignCoach({ occurrence, open, onOpenChange, onDone })
  return (
    <Sheet open={open} onOpenChange={picker.close}>
      <SheetContent
        side="bottom"
        className="max-h-dvh rounded-t-xl"
        closeLabel={t('activities.common.close')}
        data-testid="assign-coach-sheet"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{t('activities.substitutions.help')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4">
          <CoachPickerFields picker={picker} searchable />
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={picker.pending}
            onClick={() => {
              picker.close(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            data-testid="assign-coach-submit"
            disabled={picker.pending || picker.options.isLoading}
            onClick={() => {
              void picker.submit()
            }}
          >
            {t('activities.substitutions.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
