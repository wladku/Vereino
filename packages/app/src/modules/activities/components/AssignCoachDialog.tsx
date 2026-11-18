'use client'
// "Assign substitute" / "Change coach" (README B-15, flow F-03 path A; club spec glossary *Substitution*, REQ-008;
// E06-S13 #95), shared by the sessions list row action and the session record: the coaches of the club (without the
// current one) as a radio list, the free ones first, where a coach with an overlapping session is disabled with
// "Busy: {session}"; an optional reason of up to 200 characters. The state and the save live in `useAssignCoach`,
// which the phone's bottom sheet shares (E10-S08 #273).
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CoachPickerFields } from './CoachPickerFields'
import { dateLabel, instantDate, instantTime } from './client-helpers'
import { useAssignCoach, type StaffableOccurrence } from './useAssignCoach'

export type { StaffableOccurrence } from './useAssignCoach'

export function AssignCoachDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: StaffableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const picker = useAssignCoach({ occurrence, open, onOpenChange, onDone })
  const title = t(
    occurrence.coachPersonId ? 'activities.substitutions.change.title' : 'activities.substitutions.assign.title',
    {
      name: occurrence.activityName ?? t('activities.occurrences.record.title'),
      date: dateLabel(t, instantDate(occurrence.startAt)),
      time: instantTime(occurrence.startAt),
    },
  )

  return (
    <Dialog open={open} onOpenChange={picker.close}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        data-testid="assign-coach-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void picker.submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('activities.substitutions.help')}</DialogDescription>
        </DialogHeader>
        <CoachPickerFields picker={picker} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={picker.pending}
            onClick={() => {
              picker.close(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="assign-coach-submit"
            disabled={picker.pending || picker.options.isLoading}
            onClick={() => {
              void picker.submit()
            }}
          >
            {t('activities.substitutions.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
