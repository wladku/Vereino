'use client'
// The slot dialog (facilities parity spec `SlotDialog`, REQ-R02, DD-R04, DD-R05; mockup `slotModal`; README B-23,
// B-24; #277): one dialog for a free hour of the day axis, with the kinds the user may save — external rental, for a
// group (an event), general purpose — the first preselected and the focus on "Kind". The start is the tapped hour and
// the end 90 minutes later, clipped to the closing time, both editable to the minute for the club kinds; a rental ends
// after its units of 90 minutes. The zone line names the zone of the hour. Changing the kind keeps the times. B-24
// "New rental" opens the same dialog with the rental kind alone and no preset slot: the place, the date and the start
// are chosen in the dialog. The dialog owns the times and the outcome area (the start field's issues, the "Slot taken"
// list of colliding entries, the form's problem); each kind's body owns its fields and its write.
import * as React from 'react'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading, useClubToday } from '@vereino/ui'
import type { EventGroupOption } from '../../../activities/lib/member-event'
import {
  closingAfter,
  defaultSlotEnd,
  overlappingRequests,
  rentalSlotEnd,
  selectedSlotKind,
  zoneAtMinute,
  type SlotKind,
} from '../../lib/slot'
import type { Zone } from '../../lib/zones'
import { minutesOf, timeOf, type CalendarDay, type CalendarEntry } from '../club-places/places-client'
import { FieldIssues, type IssueMessage } from '../rental-issues'
import { clubInstant, useRentalTimeZone } from '../rentals-client'
import { GeneralBody, GroupBody, type SlotText } from './ClubBodies'
import { RentalBody } from './RentalBody'
import type { CollisionLine } from './slot-client'
import type { SlotReport } from './slot-types'

/** A tapped free hour: the place, the club-zone day and hour, the zone there and the closing time. */
export type SlotPreset = {
  placeId: string
  placeName: string
  date: string
  /** `HH:MM`, the tapped hour. */
  time: string
  zone: Zone | null
  /** `HH:MM` the opening window holding the hour closes at; null without a limit. */
  closing: string | null
  /** The held external requests of the day on the place's family (a club booking supersedes the overlapping ones). */
  heldRequests: ReadonlyArray<{ start: string; end: string }>
}

/** The preset of a tapped hour of the day axis: its zone, the closing time after it and the day's held requests. */
export function slotPresetAt({
  placeId,
  placeName,
  date,
  time,
  day,
  entries,
}: {
  placeId: string
  placeName: string
  date: string
  time: string
  day: CalendarDay | null
  /** Every entry of the day on the place's family. */
  entries: readonly CalendarEntry[]
}): SlotPreset {
  const minute = minutesOf(time)
  const opening = day?.opening?.map((window) => ({ from: minutesOf(window.from), to: minutesOf(window.to) }))
  const zones = (day?.zones ?? []).map((zone) => ({
    from: minutesOf(zone.from),
    to: minutesOf(zone.to),
    zone: zone.zone,
  }))
  const closing = closingAfter(opening ?? null, minute)
  return {
    placeId,
    placeName,
    date,
    time,
    zone: zoneAtMinute(zones, minute),
    closing: closing === null ? null : timeOf(closing),
    heldRequests: entries.filter((entry) => entry.kind === 'request'),
  }
}

const END_OF_DAY = 24 * 60

/** The `HH:MM` of `minutes`, kept within the day (a value past midnight shows as 24:00 is not a valid time input). */
function clampedTime(minutes: number): string {
  return timeOf(Math.min(minutes, END_OF_DAY - 1))
}

export function SlotDialog({
  open,
  onOpenChange,
  kinds,
  groups,
  preset,
  places,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The kinds the user may save, in the DD-R04 order; the first is preselected. */
  kinds: readonly SlotKind[]
  groups: readonly EventGroupOption[]
  /** The tapped hour; null for B-24 "New rental" (the place, date and start chosen here). */
  preset: SlotPreset | null
  /** The bookable places of the rental's place picker (only without a preset). */
  places: CrudFieldOption[]
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const today = useClubToday()
  const timeZone = useRentalTimeZone()
  const ids = React.useId()
  const formId = `${ids}-form`
  const kindId = `${ids}-kind`
  // The user's pick; until then the first offered kind, which may change as a coach's groups load (#366).
  const [pickedKind, setPickedKind] = React.useState<SlotKind | null>(null)
  const kind = selectedSlotKind(kinds, pickedKind)
  const [placeId, setPlaceId] = React.useState(preset?.placeId ?? (places.length === 1 ? (places[0]?.value ?? '') : ''))
  const [date, setDate] = React.useState(preset?.date ?? today)
  const [start, setStart] = React.useState(preset?.time ?? '')
  const [end, setEnd] = React.useState(() =>
    preset
      ? clampedTime(defaultSlotEnd(minutesOf(preset.time), preset.closing ? minutesOf(preset.closing) : null))
      : '',
  )
  const [units, setUnits] = React.useState(1)
  const [pending, setPending] = React.useState(false)
  const [startIssues, setStartIssues] = React.useState<IssueMessage[]>([])
  const [collisions, setCollisions] = React.useState<CollisionLine[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)

  const report = React.useMemo<SlotReport>(
    () => ({ pending: setPending, startIssues: setStartIssues, collisions: setCollisions, problem: setProblem }),
    [],
  )
  const clearOutcome = () => {
    setStartIssues([])
    setCollisions(null)
    setProblem(null)
  }

  const validTime = /^\d{2}:\d{2}$/.test(start)
  const rentalEnd = validTime ? timeOf(rentalSlotEnd(minutesOf(start), units) % END_OF_DAY) : ''
  const shownEnd = kind === 'rental' ? rentalEnd : end
  const startsAt = clubInstant(date, start, timeZone)
  const clubEnd = clubInstant(date, end, timeZone)
  const endsAt = startsAt && clubEnd && clubEnd > startsAt ? clubEnd : null
  const endInvalid = kind !== 'rental' && startsAt !== null && clubEnd !== null && endsAt === null
  const heldRequests =
    preset && startsAt && endsAt
      ? overlappingRequests(
          preset.heldRequests.map((request) => ({ start: Date.parse(request.start), end: Date.parse(request.end) })),
          Date.parse(startsAt),
          Date.parse(endsAt),
        )
      : 0
  const placeName = preset?.placeName ?? places.find((option) => option.value === placeId)?.label ?? ''
  const slot: SlotText = { place: placeName, date, start, end: shownEnd }
  const onDone = async (message: string) => {
    flash(message, 'success')
    onOpenChange(false)
    await onSaved()
  }
  const body = {
    formId,
    placeId,
    startsAt,
    endsAt: endInvalid ? null : endsAt,
    timeZone,
    disabled: pending,
    report,
    onDone,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="max-sm:inset-y-0 max-sm:max-h-dvh max-sm:rounded-none"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-slot-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(kindId)?.focus()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            ;(document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {preset
              ? t('facilities.slot.title', { place: preset.placeName, date: formatDayHeading(preset.date, locale) })
              : t('facilities.rentals.create.title')}
          </DialogTitle>
          <DialogDescription data-testid="facilities-slot-zone">
            {preset
              ? t('facilities.slot.zone', {
                  zone: preset.zone ? t(`facilities.zones.zone.${preset.zone}`) : t('facilities.common.empty'),
                })
              : t('facilities.rentals.create.help')}
            {preset && kind !== 'rental' ? ` ${t('facilities.slot.staffImmediate')}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor={kindId}>{t('facilities.slot.kind')}</Label>
            <Select
              value={kind}
              disabled={pending || kinds.length < 2}
              onValueChange={(next: string) => {
                const chosen = kinds.find((entry) => entry === next)
                if (!chosen) return
                // The times stay; only the body changes.
                setPickedKind(chosen)
                clearOutcome()
              }}
            >
              <SelectTrigger id={kindId} data-testid="facilities-slot-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`facilities.slot.kind.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset ? null : (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
              <Select
                value={placeId}
                disabled={pending}
                onValueChange={(next: string) => {
                  setPlaceId(next)
                  clearOutcome()
                }}
              >
                <SelectTrigger id={`${ids}-place`} data-testid="facilities-rental-place">
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
          )}

          <div className="flex flex-col gap-2">
            <div className={`grid grid-cols-1 gap-3 ${preset ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {preset ? null : (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-date`}>{t('facilities.rentals.fields.date')}</Label>
                  <Input
                    id={`${ids}-date`}
                    type="date"
                    required
                    value={date}
                    disabled={pending}
                    data-testid="facilities-rental-date"
                    onChange={(event) => {
                      setDate(event.target.value)
                      clearOutcome()
                    }}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-start`}>{t('facilities.slot.from')}</Label>
                <Input
                  id={`${ids}-start`}
                  type="time"
                  step={60}
                  required
                  value={start}
                  disabled={pending}
                  data-testid="facilities-slot-start"
                  aria-invalid={startIssues.length > 0 ? true : undefined}
                  aria-describedby={startIssues.length > 0 ? `${ids}-start-issues` : undefined}
                  onChange={(event) => {
                    setStart(event.target.value)
                    clearOutcome()
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-end`}>{t('facilities.slot.to')}</Label>
                <Input
                  id={`${ids}-end`}
                  type="time"
                  step={60}
                  value={shownEnd}
                  readOnly={kind === 'rental'}
                  disabled={pending}
                  data-testid="facilities-slot-end"
                  aria-invalid={endInvalid ? true : undefined}
                  aria-describedby={endInvalid ? `${ids}-end-problem` : undefined}
                  onChange={(event) => {
                    if (kind === 'rental') return
                    setEnd(event.target.value)
                    clearOutcome()
                  }}
                />
              </div>
            </div>
            {endInvalid ? (
              <p id={`${ids}-end-problem`} className="text-destructive text-xs" role="alert">
                {t('facilities.slot.errors.endAfterStart')}
              </p>
            ) : null}
            <div data-testid="facilities-slot-start-issues">
              <FieldIssues id={`${ids}-start-issues`} messages={startIssues} />
            </div>
          </div>

          {kind === 'rental' ? (
            <RentalBody {...body} units={units} onUnits={setUnits} />
          ) : kind === 'group' ? (
            <GroupBody {...body} groups={groups} heldRequests={heldRequests} slot={slot} />
          ) : (
            <GeneralBody {...body} slot={slot} />
          )}

          {collisions && collisions.length > 0 ? (
            <Alert status="error" data-testid="facilities-slot-collisions">
              <AlertTitle>{t('facilities.slot.slotTaken')}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc ps-4">
                  {collisions.map((line) => (
                    <li key={line.key} className="break-words">
                      {line.text}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-slot-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
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
            type="submit"
            form={formId}
            className="min-h-11"
            disabled={pending || endInvalid}
            data-testid="facilities-slot-submit"
          >
            {pending ? t('facilities.common.saving') : t('facilities.slot.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
