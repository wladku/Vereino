'use client'
// "Mark done" of a maintenance task (facilities spec B-27 maintenance tab and `/club/places/maintenance`; REQ-022,
// REQ-R15; #128, #283): when it was done (default now), the cost and notes. The task's version travels as the lock
// token; a 409 conflict surfaces through the platform's conflict UI, and a task done or cancelled meanwhile (409
// `invalid_transition` from the complete route) is said in the dialog with the `maintenance_task_closed` message and
// the list is refreshed. A recurring task gets its next instance.
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { amountToMinor, codedMessage, errorMessage, minorToAmount } from './facilities-client'
import { completeMaintenanceTask, kindLabel, type MaintenanceTaskRow } from './maintenance-client'

const NOTES_MAX_LENGTH = 2000

export type MaintenanceCompleteDialogProps = {
  task: MaintenanceTaskRow
  onOpenChange: (open: boolean) => void
  onDone: (nextTaskId: string | null) => Promise<void>
  onRefresh: () => void
  /** A `datetime-local` value as an ISO instant (null when invalid), and back. */
  toInstant: (local: string) => string | null
  toLocal: (iso: string | null | undefined) => string
}

export function MaintenanceCompleteDialog({
  task,
  onOpenChange,
  onDone,
  onRefresh,
  toInstant,
  toLocal,
}: MaintenanceCompleteDialogProps) {
  const t = useT()
  const ids = React.useId()
  const [doneAt, setDoneAt] = React.useState(toLocal(new Date().toISOString()))
  const [cost, setCost] = React.useState(task.cost !== null ? minorToAmount(task.cost) : '')
  const [notes, setNotes] = React.useState(task.notes ?? '')
  const [pending, setPending] = React.useState(false)
  const [problems, setProblems] = React.useState<Partial<Record<'doneAt' | 'cost', string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)

  const submit = async () => {
    if (pending) return
    const at = toInstant(doneAt)
    const minor = cost.trim() ? amountToMinor(cost) : null
    const next: Partial<Record<'doneAt' | 'cost', string>> = {}
    if (!at) next.doneAt = t('facilities.maintenance.errors.required')
    if (cost.trim() && minor === null) next.cost = t('facilities.maintenance.errors.cost')
    setProblems(next)
    if (Object.keys(next).length > 0 || !at) {
      setProblem(t('facilities.errors.invalid'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const call = await completeMaintenanceTask(
        task,
        { doneAt: at, cost: minor, notes: notes.trim() ? notes.trim() : null },
        t('facilities.maintenance.errors.complete'),
      )
      onOpenChange(false)
      await onDone(call.result?.nextTaskId ?? null)
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      // Done or cancelled meanwhile (the complete route answers 409 `invalid_transition`, a change 409
      // `maintenance_task_closed`): the dialog says so and the list shows the task where it now belongs.
      const code = errorCodeOf(error)
      if (code === 'maintenance_task_closed' || code === 'invalid_transition') {
        onRefresh()
        setProblem(t('facilities.errors.maintenance_task_closed'))
        return
      }
      setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.maintenance.errors.complete')))
    } finally {
      setPending(false)
    }
  }

  const fieldProblem = (field: 'doneAt' | 'cost') =>
    problems[field] ? (
      <p id={`${ids}-${field}-problem`} className="text-destructive text-xs" role="alert">
        {problems[field]}
      </p>
    ) : null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-maintenance-complete-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.maintenance.complete.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.maintenance.complete.help', {
              kind: kindLabel(t, task.kind),
              place: task.placeName ?? t('facilities.common.unknownPlace'),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-done`}>{t('facilities.maintenance.fields.doneAt')}</Label>
            <Input
              id={`${ids}-done`}
              type="datetime-local"
              className="min-h-11 sm:w-64"
              required
              value={doneAt}
              disabled={pending}
              data-testid="facilities-maintenance-complete-done-at"
              aria-invalid={problems.doneAt ? true : undefined}
              aria-describedby={problems.doneAt ? `${ids}-doneAt-problem` : undefined}
              onChange={(event) => {
                setDoneAt(event.target.value)
              }}
            />
            {fieldProblem('doneAt')}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-cost`}>{t('facilities.maintenance.fields.cost')}</Label>
            <Input
              id={`${ids}-cost`}
              inputMode="decimal"
              className="min-h-11 sm:w-40"
              value={cost}
              disabled={pending}
              data-testid="facilities-maintenance-complete-cost"
              aria-invalid={problems.cost ? true : undefined}
              aria-describedby={problems.cost ? `${ids}-cost-problem` : undefined}
              onChange={(event) => {
                setCost(event.target.value)
              }}
            />
            {fieldProblem('cost')}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-notes`}>{t('facilities.maintenance.fields.notes')}</Label>
            <Textarea
              id={`${ids}-notes`}
              rows={3}
              maxLength={NOTES_MAX_LENGTH}
              value={notes}
              disabled={pending}
              data-testid="facilities-maintenance-complete-notes"
              onChange={(event) => {
                setNotes(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-maintenance-complete-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending}
            data-testid="facilities-maintenance-complete-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.maintenance.complete.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
