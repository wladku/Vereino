'use client'
// The dialogs of `/club/facility` (README M-12; REQ-013, REQ-016; #126): "Open facility" (the time, now by default,
// and the condition before, required), "Close facility" (the time, the condition after, required, and remarks) and
// "Report incident" (the kind, the time, now by default, a description of 10–2000 characters with the hint not to
// enter health data, the actions taken, the people involved and up to 5 photos, uploaded once the incident is saved,
// #126). The facilities parity spec (#282, J-R08) adds the party involved picked from today's rentals (its renter's
// name goes into "people involved") and "Request an entry ban" (the action `entry_ban_requested`, which notifies the
// club administrators). A coded refusal stays in the dialog next to the form; a conflict (the log changed or was
// started meanwhile) closes it and the page reloads the day. The panel's Incidents tab reuses "Report incident" with a
// place and a day of its own choice (B-27, REQ-R10; #281), and its Log tab the time and condition fields.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays } from '@vereino/core'
import {
  INCIDENT_ACTIONS,
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_DESCRIPTION_MIN_LENGTH,
  INCIDENT_INVOLVED_MAX_LENGTH,
  INCIDENT_KINDS,
  INCIDENT_PHOTOS_MAX,
  type IncidentAction,
  type IncidentKind,
} from '../../lib/incidents'
import { LOG_TEXT_MAX_LENGTH } from '../../lib/logs'
import {
  clubInstant,
  clubTimeNow,
  entryTimes,
  reportIncident,
  saveLog,
  uploadIncidentPhoto,
  writeErrorMessage,
  type FacilityToday,
  type WriteResult,
} from './facility-client'
import { DialogContent } from '@/components/ui/dialog'

/**
 * What a dialog reports to the page: the success message (a warning when part of it failed, e.g. a photo upload), or a
 * conflict the page answers by reloading the day.
 */
export type DialogOutcome = { kind: 'done'; message: string; warning?: boolean } | { kind: 'conflict'; message: string }

type DialogProps = {
  today: FacilityToday
  open: boolean
  onOpenChange: (open: boolean) => void
  onOutcome: (outcome: DialogOutcome) => void
}

/** The shared submit: a conflict closes the dialog for a reload, another refusal is shown in the dialog. */
function useSubmit(onOutcome: DialogProps['onOutcome'], onOpenChange: DialogProps['onOpenChange']) {
  const t = useT()
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const run = async (
    write: () => Promise<WriteResult>,
    success: () => string,
    fallbackKey: string,
    partlyFailed: () => boolean = () => false,
  ) => {
    if (pending) return
    setPending(true)
    setProblem(null)
    try {
      const result = await write()
      if (result.ok) {
        onOpenChange(false)
        onOutcome({ kind: 'done', message: success(), warning: partlyFailed() })
      } else if (result.status === 409) {
        onOpenChange(false)
        onOutcome({ kind: 'conflict', message: writeErrorMessage(t, result, fallbackKey) })
      } else {
        setProblem(writeErrorMessage(t, result, fallbackKey))
      }
    } finally {
      setPending(false)
    }
  }
  return { pending, problem, setProblem, run }
}

export function Problem({ text, testId }: { text: string | null; testId: string }) {
  if (!text) return null
  return (
    <p className="text-destructive text-sm" role="alert" data-testid={testId}>
      {text}
    </p>
  )
}

export function TimeField({
  id,
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  testId: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="time"
        required
        value={value}
        disabled={disabled}
        className="min-h-11 sm:w-40"
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )
}

export function ConditionField({
  id,
  label,
  help,
  value,
  onChange,
  disabled,
  missing,
  testId,
}: {
  id: string
  label: string
  help: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  missing: string | null
  testId: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={3}
        required
        maxLength={LOG_TEXT_MAX_LENGTH}
        value={value}
        disabled={disabled}
        aria-invalid={missing ? true : undefined}
        aria-describedby={`${id}-help${missing ? ` ${id}-missing` : ''}`}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {help}
      </p>
      {missing ? (
        <p id={`${id}-missing`} className="text-destructive text-xs" role="alert">
          {missing}
        </p>
      ) : null}
    </div>
  )
}

export function submitOnCtrlEnter(submit: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }
}

export function OpenFacilityDialog({ today, open, onOpenChange, onOutcome }: DialogProps) {
  const t = useT()
  const ids = React.useId()
  const [time, setTime] = React.useState(() => clubTimeNow(today.timeZone))
  const [condition, setCondition] = React.useState(today.log?.conditionBefore ?? '')
  const [missing, setMissing] = React.useState<string | null>(null)
  const { pending, problem, setProblem, run } = useSubmit(onOutcome, onOpenChange)

  const submit = () => {
    const openedAt = clubInstant(today.date, time, today.timeZone)
    if (!condition.trim()) {
      setMissing(t('facilities.errors.log_condition_required'))
      return
    }
    if (!openedAt) {
      setProblem(t('facilities.facility.errors.time'))
      return
    }
    setMissing(null)
    void run(
      () => saveLog(today, { openedAt, conditionBefore: condition.trim() }),
      () => t('facilities.facility.open.done', { time }),
      'facilities.facility.errors.open',
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="club-facility-open-dialog"
        onKeyDown={submitOnCtrlEnter(submit)}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.facility.open.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.facility.open.help', { place: today.place?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <TimeField
            id={`${ids}-time`}
            label={t('facilities.facility.fields.openedAt')}
            value={time}
            onChange={setTime}
            disabled={pending}
            testId="club-facility-open-time"
          />
          <ConditionField
            id={`${ids}-condition`}
            label={t('facilities.facility.fields.conditionBefore')}
            help={t('facilities.facility.fields.conditionBefore.help')}
            value={condition}
            onChange={(value) => {
              setCondition(value)
              setMissing(null)
            }}
            disabled={pending}
            missing={missing}
            testId="club-facility-open-condition"
          />
          <Problem text={problem} testId="club-facility-open-problem" />
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
            data-testid="club-facility-open-submit"
            onClick={submit}
          >
            {pending ? t('facilities.common.saving') : t('facilities.facility.open.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CloseFacilityDialog({ today, open, onOpenChange, onOutcome }: DialogProps) {
  const t = useT()
  const ids = React.useId()
  const [time, setTime] = React.useState(() => clubTimeNow(today.timeZone))
  const [condition, setCondition] = React.useState(today.log?.conditionAfter ?? '')
  const [remarks, setRemarks] = React.useState(today.log?.remarks ?? '')
  const [missing, setMissing] = React.useState<string | null>(null)
  const { pending, problem, setProblem, run } = useSubmit(onOutcome, onOpenChange)

  const submit = () => {
    // A place that closes after midnight: a closing time before the opening one is on the next day.
    const sameDay = clubInstant(today.date, time, today.timeZone)
    const openedAt = today.log?.openedAt ?? null
    const closedAt =
      sameDay && openedAt && sameDay < openedAt ? clubInstant(addDays(today.date, 1), time, today.timeZone) : sameDay
    if (!condition.trim()) {
      setMissing(t('facilities.errors.log_condition_required'))
      return
    }
    if (!closedAt) {
      setProblem(t('facilities.facility.errors.time'))
      return
    }
    setMissing(null)
    void run(
      () => saveLog(today, { closedAt, conditionAfter: condition.trim(), remarks: remarks.trim() || null }),
      () => t('facilities.facility.close.done', { time }),
      'facilities.facility.errors.close',
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="club-facility-close-dialog"
        onKeyDown={submitOnCtrlEnter(submit)}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.facility.close.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.facility.close.help', { place: today.place?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <TimeField
            id={`${ids}-time`}
            label={t('facilities.facility.fields.closedAt')}
            value={time}
            onChange={setTime}
            disabled={pending}
            testId="club-facility-close-time"
          />
          <ConditionField
            id={`${ids}-condition`}
            label={t('facilities.facility.fields.conditionAfter')}
            help={t('facilities.facility.fields.conditionAfter.help')}
            value={condition}
            onChange={(value) => {
              setCondition(value)
              setMissing(null)
            }}
            disabled={pending}
            missing={missing}
            testId="club-facility-close-condition"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-remarks`}>{t('facilities.facility.fields.remarks')}</Label>
            <Textarea
              id={`${ids}-remarks`}
              rows={3}
              maxLength={LOG_TEXT_MAX_LENGTH}
              value={remarks}
              disabled={pending}
              data-testid="club-facility-close-remarks"
              onChange={(event) => {
                setRemarks(event.target.value)
              }}
            />
          </div>
          <Problem text={problem} testId="club-facility-close-problem" />
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
            data-testid="club-facility-close-submit"
            onClick={submit}
          >
            {pending ? t('facilities.common.saving') : t('facilities.facility.close.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The checkboxes of the actions taken (`none` is implied by an empty choice). */
export const CHOOSABLE_ACTIONS = INCIDENT_ACTIONS.filter((action) => action !== 'none')

/** The ban request has its own control in the attendant's dialog (J-R08, DD-R12). */
const BAN_REQUEST: IncidentAction = 'entry_ban_requested'

export function ActionChoices({
  idPrefix,
  legend,
  value,
  onChange,
  disabled,
  testIdPrefix,
  exclude = [],
}: {
  idPrefix: string
  legend: string
  value: readonly IncidentAction[]
  onChange: (next: IncidentAction[]) => void
  disabled: boolean
  testIdPrefix: string
  /** Actions the caller offers with a control of its own. */
  exclude?: readonly IncidentAction[]
}) {
  const t = useT()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CHOOSABLE_ACTIONS.filter((action) => !exclude.includes(action)).map((action) => {
          const id = `${idPrefix}-${action}`
          const checked = value.includes(action)
          return (
            <div key={action} className="flex min-h-11 items-center gap-2">
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                data-testid={`${testIdPrefix}-${action}`}
                onCheckedChange={(next) => {
                  onChange(
                    next === true
                      ? CHOOSABLE_ACTIONS.filter((entry) => entry === action || value.includes(entry))
                      : value.filter((entry) => entry !== action),
                  )
                }}
              />
              <Label htmlFor={id}>{t(`facilities.records.incidentAction.${action}`)}</Label>
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * The panel's choice of where and when (B-27; #281): the places to pick from and the latest day (today). Without it the
 * dialog reports at the attendant's place, today.
 */
export type IncidentWhere = { places: ReadonlyArray<{ value: string; label: string }>; maxDate: string }

export function IncidentDialog({
  today,
  open,
  onOpenChange,
  onOutcome,
  where,
}: Omit<DialogProps, 'today'> & {
  today: Pick<FacilityToday, 'date' | 'timeZone' | 'place' | 'entries'>
  where?: IncidentWhere
}) {
  const t = useT()
  const ids = React.useId()
  const [kind, setKind] = React.useState<IncidentKind | ''>('')
  const [placeId, setPlaceId] = React.useState(() =>
    where ? (where.places.length === 1 ? (where.places[0]?.value ?? '') : '') : (today.place?.id ?? ''),
  )
  const [date, setDate] = React.useState(today.date)
  const [placeMissing, setPlaceMissing] = React.useState(false)
  const [time, setTime] = React.useState(() => clubTimeNow(today.timeZone))
  const [description, setDescription] = React.useState('')
  const [actions, setActions] = React.useState<IncidentAction[]>([])
  const [involved, setInvolved] = React.useState('')
  const [photos, setPhotos] = React.useState<File[]>([])
  const [banRequested, setBanRequested] = React.useState(false)
  const [rentalId, setRentalId] = React.useState('')
  const [kindMissing, setKindMissing] = React.useState(false)
  const { pending, problem, setProblem, run } = useSubmit(onOutcome, onOpenChange)
  const rentals = today.entries.filter((entry) => entry.kind === 'rental' && entry.label)

  /** A rental picked as the party involved adds its renter's name to "people involved" (J-R08). */
  const pickRental = (id: string) => {
    setRentalId(id)
    const name = rentals.find((entry) => entry.id === id)?.label
    if (!name) return
    setInvolved((current) => {
      const text = current.trim()
      if (!text) return name
      return text.includes(name) ? current : `${text}, ${name}`
    })
  }

  const submit = () => {
    const occurredAt = clubInstant(date, time, today.timeZone)
    if (!kind) {
      setKindMissing(true)
      return
    }
    if (!placeId) {
      setPlaceMissing(true)
      return
    }
    if (!occurredAt) {
      setProblem(t('facilities.facility.errors.time'))
      return
    }
    let failedPhotos = 0
    void run(
      async () => {
        const reported = await reportIncident({
          placeId,
          occurredAt,
          kind,
          description: description.trim(),
          involved: involved.trim() || null,
          actionTaken: banRequested ? [...actions, BAN_REQUEST] : actions,
        })
        // The photos follow the saved incident; one that fails leaves the incident reported and is counted.
        const incidentId = reported.ok ? reported.answer.id : undefined
        if (incidentId) {
          for (const photo of photos) {
            if (!(await uploadIncidentPhoto(incidentId, photo)).ok) failedPhotos += 1
          }
        }
        return reported
      },
      () => {
        if (failedPhotos > 0) return t('facilities.facility.incident.donePhotosFailed', { count: failedPhotos })
        return banRequested
          ? t('facilities.facility.incident.doneBanRequested')
          : t('facilities.facility.incident.done')
      },
      'facilities.facility.errors.incident',
      () => failedPhotos > 0,
    )
  }

  const length = description.trim().length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="club-facility-incident-dialog"
        onKeyDown={submitOnCtrlEnter(submit)}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.facility.incident.title')}</DialogTitle>
          <DialogDescription>
            {where
              ? t('facilities.records.incidents.report.help')
              : t('facilities.facility.incident.help', { place: today.place?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {where ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
                <Select
                  value={placeId}
                  disabled={pending}
                  onValueChange={(next: string) => {
                    setPlaceId(next)
                    setPlaceMissing(false)
                  }}
                >
                  <SelectTrigger
                    id={`${ids}-place`}
                    className="min-h-11"
                    data-testid="club-facility-incident-place"
                    aria-invalid={placeMissing ? true : undefined}
                    aria-describedby={placeMissing ? `${ids}-place-missing` : undefined}
                  >
                    <SelectValue placeholder={t('facilities.fields.place.choose')} />
                  </SelectTrigger>
                  <SelectContent>
                    {where.places.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {placeMissing ? (
                  <p id={`${ids}-place-missing`} className="text-destructive text-xs" role="alert">
                    {t('facilities.records.bans.errors.place')}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-date`}>{t('facilities.records.fields.day')}</Label>
                <Input
                  id={`${ids}-date`}
                  type="date"
                  required
                  max={where.maxDate}
                  value={date}
                  disabled={pending}
                  className="min-h-11"
                  data-testid="club-facility-incident-date"
                  onChange={(event) => {
                    setDate(event.target.value)
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-kind`}>{t('facilities.records.fields.kind')}</Label>
              <Select
                value={kind}
                disabled={pending}
                onValueChange={(next: string) => {
                  setKind(INCIDENT_KINDS.find((entry) => entry === next) ?? '')
                  setKindMissing(false)
                }}
              >
                <SelectTrigger
                  id={`${ids}-kind`}
                  className="min-h-11"
                  data-testid="club-facility-incident-kind"
                  aria-invalid={kindMissing ? true : undefined}
                  aria-describedby={kindMissing ? `${ids}-kind-missing` : undefined}
                >
                  <SelectValue placeholder={t('facilities.records.fields.kind.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_KINDS.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {t(`facilities.records.incidentKind.${entry}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kindMissing ? (
                <p id={`${ids}-kind-missing`} className="text-destructive text-xs" role="alert">
                  {t('facilities.facility.incident.kindRequired')}
                </p>
              ) : null}
            </div>
            <TimeField
              id={`${ids}-time`}
              label={t('facilities.records.fields.occurredAt')}
              value={time}
              onChange={setTime}
              disabled={pending}
              testId="club-facility-incident-time"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-description`}>{t('facilities.records.fields.description')}</Label>
            <Textarea
              id={`${ids}-description`}
              rows={4}
              maxLength={INCIDENT_DESCRIPTION_MAX_LENGTH}
              value={description}
              disabled={pending}
              aria-describedby={`${ids}-description-help ${ids}-description-count`}
              data-testid="club-facility-incident-description"
              onChange={(event) => {
                setDescription(event.target.value)
              }}
            />
            <p
              id={`${ids}-description-help`}
              className="text-muted-foreground text-xs"
              data-testid="club-facility-incident-health-hint"
            >
              {t('facilities.facility.incident.healthHint')}
            </p>
            <p id={`${ids}-description-count`} className="text-muted-foreground text-xs tabular-nums">
              {t('facilities.facility.incident.length', {
                count: length,
                min: INCIDENT_DESCRIPTION_MIN_LENGTH,
                max: INCIDENT_DESCRIPTION_MAX_LENGTH,
              })}
            </p>
          </div>
          <ActionChoices
            idPrefix={`${ids}-action`}
            legend={t('facilities.records.fields.actionTaken')}
            value={actions}
            onChange={setActions}
            disabled={pending}
            testIdPrefix="club-facility-incident-action"
            exclude={[BAN_REQUEST]}
          />
          {rentals.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-rental`}>{t('facilities.facility.incident.rental')}</Label>
              <Select value={rentalId} disabled={pending} onValueChange={pickRental}>
                <SelectTrigger
                  id={`${ids}-rental`}
                  className="min-h-11"
                  aria-describedby={`${ids}-rental-help`}
                  data-testid="club-facility-incident-rental"
                >
                  <SelectValue placeholder={t('facilities.facility.incident.rental.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {rentals.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {`${entryTimes(entry, today.timeZone)} ${entry.label ?? ''}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={`${ids}-rental-help`} className="text-muted-foreground text-xs">
                {t('facilities.facility.incident.rental.help')}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-involved`}>{t('facilities.records.fields.involved')}</Label>
            <Textarea
              id={`${ids}-involved`}
              rows={2}
              maxLength={INCIDENT_INVOLVED_MAX_LENGTH}
              value={involved}
              disabled={pending}
              aria-describedby={`${ids}-involved-help`}
              data-testid="club-facility-incident-involved"
              onChange={(event) => {
                setInvolved(event.target.value)
              }}
            />
            <p id={`${ids}-involved-help`} className="text-muted-foreground text-xs">
              {t('facilities.facility.incident.involvedHelp')}
            </p>
          </div>
          <div className="flex flex-col gap-1 rounded-md border p-3">
            <div className="flex min-h-11 items-center gap-2">
              <Checkbox
                id={`${ids}-ban`}
                checked={banRequested}
                disabled={pending}
                aria-describedby={`${ids}-ban-help`}
                data-testid="club-facility-incident-ban-request"
                onCheckedChange={(next) => {
                  setBanRequested(next === true)
                }}
              />
              <Label htmlFor={`${ids}-ban`}>{t('facilities.facility.incident.banRequest')}</Label>
            </div>
            <p id={`${ids}-ban-help`} className="text-muted-foreground text-xs">
              {t('facilities.facility.incident.banRequest.help')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-photos`}>{t('facilities.facility.incident.photos')}</Label>
            <Input
              id={`${ids}-photos`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={pending}
              className="min-h-11"
              aria-describedby={`${ids}-photos-help`}
              data-testid="club-facility-incident-photos"
              onChange={(event) => {
                setPhotos(Array.from(event.target.files ?? []).slice(0, INCIDENT_PHOTOS_MAX))
              }}
            />
            <p id={`${ids}-photos-help`} className="text-muted-foreground text-xs">
              {t('facilities.facility.incident.photosHelp', { max: INCIDENT_PHOTOS_MAX })}
              {photos.length > 0 ? ` ${t('facilities.facility.incident.photosChosen', { count: photos.length })}` : ''}
            </p>
          </div>
          <Problem text={problem} testId="club-facility-incident-problem" />
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
            data-testid="club-facility-incident-submit"
            onClick={submit}
          >
            {pending ? t('facilities.common.saving') : t('facilities.facility.incident.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
