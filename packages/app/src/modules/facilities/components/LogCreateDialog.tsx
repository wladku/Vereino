'use client'
// "Add entry" of the Log tab (facilities parity spec B-27, REQ-R10; #281): the panel writes a day's facility log after
// the fact — the place, a day up to today, the opening and closing times, the conditions before and after, the groups
// present with their head count and the remarks — through `POST /api/facilities/logs`, the attendant's route. The
// server keeps its rules: a day after its edit window is the club administrator's only (403 `log_edit_closed`), one log
// per place and day (409 `log_exists`), the conditions and the times (422); each refusal is shown in the dialog. The
// time and condition fields are the attendant's (`club-facility/FacilityDialogs.tsx`); the times are in the club's zone.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays } from '@vereino/core'
import { browserTimeZone, useClubTimeZone, useClubToday } from '@vereino/ui'
import { HEADCOUNT_MAX, LOG_TEXT_MAX_LENGTH } from '../lib/logs'
import { ConditionField, Problem, TimeField, submitOnCtrlEnter } from './club-facility/FacilityDialogs'
import { clubInstant, clubTime, createLog, writeErrorMessage, type GroupPresent } from './club-facility/facility-client'
import { dayWindow, entriesOfDay, useStaffCalendar, type CalendarEntry } from './club-places/places-client'

type GroupDraft = { headcount: string; supervisor: boolean }

/** The entries of the day a group may be present at: the sessions and the rentals. */
function presentable(entry: CalendarEntry): boolean {
  return entry.kind === 'session' || entry.kind === 'rental'
}

/** The groups typed in, in the API's shape; null when a head count is not a whole number in range. */
function groupsOf(
  entries: readonly CalendarEntry[],
  drafts: Partial<Record<string, GroupDraft>>,
): GroupPresent[] | null {
  const groups: GroupPresent[] = []
  for (const entry of entries) {
    const draft = drafts[entry.id]
    if (!draft || draft.headcount.trim() === '') continue
    const headcount = Number(draft.headcount)
    if (!Number.isInteger(headcount) || headcount < 0 || headcount > HEADCOUNT_MAX) return null
    const reference = entry.kind === 'session' ? { occurrenceId: entry.id } : { rentalId: entry.id }
    groups.push({ ...reference, headcount, adultSupervisorPresent: draft.supervisor })
  }
  return groups
}

export function LogCreateDialog({
  open,
  onOpenChange,
  places,
  initialPlaceId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: ReadonlyArray<{ value: string; label: string }>
  initialPlaceId: string | null
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const today = useClubToday()
  const timeZone = useClubTimeZone() ?? browserTimeZone()
  const [placeId, setPlaceId] = React.useState(initialPlaceId ?? (places.length === 1 ? (places[0]?.value ?? '') : ''))
  const [date, setDate] = React.useState(() => addDays(today, -1))
  const [opened, setOpened] = React.useState('')
  const [closed, setClosed] = React.useState('')
  const [before, setBefore] = React.useState('')
  const [after, setAfter] = React.useState('')
  const [remarks, setRemarks] = React.useState('')
  const [drafts, setDrafts] = React.useState<Partial<Record<string, GroupDraft>>>({})
  const [missing, setMissing] = React.useState<{ before?: string; after?: string }>({})
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
  const calendar = useStaffCalendar({
    ...dayWindow(validDate ? date : today, timeZone),
    placeId: placeId || undefined,
  })
  const entries =
    placeId && validDate && calendar.data ? entriesOfDay(calendar.data.entries, date, timeZone).filter(presentable) : []

  const setDraft = (id: string, change: Partial<GroupDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { headcount: '', supervisor: false }), ...change },
    }))
  }

  const submit = async () => {
    if (pending) return
    if (!placeId) {
      setProblem(t('facilities.records.bans.errors.place'))
      return
    }
    if (!validDate) {
      setProblem(t('facilities.errors.log_date_invalid'))
      return
    }
    const openedAt = opened ? clubInstant(date, opened, timeZone) : null
    // A place that closes after midnight: a closing time before the opening one is on the next day.
    const sameDay = closed ? clubInstant(date, closed, timeZone) : null
    const closedAt =
      sameDay && openedAt && sameDay < openedAt ? clubInstant(addDays(date, 1), closed, timeZone) : sameDay
    const nextMissing = {
      ...(opened && !before.trim() ? { before: t('facilities.errors.log_condition_required') } : {}),
      ...(closed && !after.trim() ? { after: t('facilities.errors.log_condition_required') } : {}),
    }
    setMissing(nextMissing)
    if (nextMissing.before || nextMissing.after) return
    const groups = groupsOf(entries, drafts)
    if (!groups) {
      setProblem(t('facilities.facility.groups.headcountInvalid', { max: HEADCOUNT_MAX }))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const result = await createLog({
        placeId,
        logDate: date,
        ...(openedAt
          ? { openedAt, conditionBefore: before.trim() }
          : before.trim()
            ? { conditionBefore: before.trim() }
            : {}),
        ...(closedAt
          ? { closedAt, conditionAfter: after.trim() }
          : after.trim()
            ? { conditionAfter: after.trim() }
            : {}),
        groupsPresent: groups,
        remarks: remarks.trim() || null,
      })
      if (!result.ok) {
        setProblem(writeErrorMessage(t, result, 'facilities.records.logs.errors.save'))
        return
      }
      flash(t('facilities.records.logs.flash.created'), 'success')
      onOpenChange(false)
      await onSaved()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-log-create-dialog"
        onKeyDown={submitOnCtrlEnter(() => void submit())}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.records.logs.create.title')}</DialogTitle>
          <DialogDescription>{t('facilities.records.logs.create.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
              <Select
                value={placeId}
                disabled={pending}
                onValueChange={(next: string) => {
                  setPlaceId(next)
                  setDrafts({})
                }}
              >
                <SelectTrigger id={`${ids}-place`} className="min-h-11" data-testid="facilities-log-create-place">
                  <SelectValue placeholder={t('facilities.fields.place.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {places.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-date`}>{t('facilities.records.fields.day')}</Label>
              <Input
                id={`${ids}-date`}
                type="date"
                required
                max={today}
                value={date}
                disabled={pending}
                className="min-h-11"
                aria-describedby={`${ids}-date-help`}
                data-testid="facilities-log-create-date"
                onChange={(event) => {
                  setDate(event.target.value)
                  setDrafts({})
                }}
              />
              <p id={`${ids}-date-help`} className="text-muted-foreground text-xs">
                {t('facilities.records.logs.create.dateHelp')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TimeField
              id={`${ids}-opened`}
              label={t('facilities.facility.fields.openedAt')}
              value={opened}
              onChange={setOpened}
              disabled={pending}
              testId="facilities-log-create-opened"
            />
            <TimeField
              id={`${ids}-closed`}
              label={t('facilities.facility.fields.closedAt')}
              value={closed}
              onChange={setClosed}
              disabled={pending}
              testId="facilities-log-create-closed"
            />
          </div>
          <ConditionField
            id={`${ids}-before`}
            label={t('facilities.facility.fields.conditionBefore')}
            help={t('facilities.facility.fields.conditionBefore.help')}
            value={before}
            onChange={(value) => {
              setBefore(value)
              setMissing((current) => ({ ...current, before: undefined }))
            }}
            disabled={pending}
            missing={missing.before ?? null}
            testId="facilities-log-create-before"
          />
          <ConditionField
            id={`${ids}-after`}
            label={t('facilities.facility.fields.conditionAfter')}
            help={t('facilities.facility.fields.conditionAfter.help')}
            value={after}
            onChange={(value) => {
              setAfter(value)
              setMissing((current) => ({ ...current, after: undefined }))
            }}
            disabled={pending}
            missing={missing.after ?? null}
            testId="facilities-log-create-after"
          />
          <fieldset className="flex flex-col gap-2" data-testid="facilities-log-create-groups">
            <legend className="text-sm font-medium">{t('facilities.records.logs.columns.groups')}</legend>
            {entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {calendar.isLoading && placeId
                  ? t('facilities.common.loading')
                  : t('facilities.records.logs.create.noGroups')}
              </p>
            ) : (
              entries.map((entry) => {
                const draft = drafts[entry.id]
                const label = `${clubTime(entry.start, timeZone)}–${clubTime(entry.end, timeZone)} ${
                  entry.groupName ?? entry.label ?? ''
                }`
                return (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor={`${ids}-headcount-${entry.id}`}>{label}</Label>
                      <Input
                        id={`${ids}-headcount-${entry.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={HEADCOUNT_MAX}
                        placeholder={t('facilities.facility.groups.headcount')}
                        value={draft?.headcount ?? ''}
                        disabled={pending}
                        className="min-h-11 sm:w-40"
                        onChange={(event) => {
                          setDraft(entry.id, { headcount: event.target.value })
                        }}
                      />
                    </div>
                    <div className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`${ids}-supervisor-${entry.id}`}
                        checked={draft?.supervisor ?? false}
                        disabled={pending}
                        onCheckedChange={(next) => {
                          setDraft(entry.id, { supervisor: next === true })
                        }}
                      />
                      <Label htmlFor={`${ids}-supervisor-${entry.id}`}>
                        {t('facilities.facility.groups.supervisor')}
                      </Label>
                    </div>
                  </div>
                )
              })
            )}
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-remarks`}>{t('facilities.facility.fields.remarks')}</Label>
            <Textarea
              id={`${ids}-remarks`}
              rows={3}
              maxLength={LOG_TEXT_MAX_LENGTH}
              value={remarks}
              disabled={pending}
              data-testid="facilities-log-create-remarks"
              onChange={(event) => {
                setRemarks(event.target.value)
              }}
            />
          </div>
          <Problem text={problem} testId="facilities-log-create-problem" />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-log-create-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.records.logs.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
