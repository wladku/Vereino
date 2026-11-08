'use client'
// The "Book" dialog of the day timeline (README M-11; REQ-023, REQ-027; #123): the chosen range of the place, booked
// in one of two ways. "General purpose" — a purpose of 3–120 characters and a section → `POST
// /api/facilities/internal-bookings`; "For a group" — one of the caller's own groups, the type (tournament or other),
// the name and, for a tournament, the invited external teams → `POST /api/activities/events` (offered only to a user
// with `activities.events.create` on a bookable leaf). A refusal stays in the dialog: a 409 lists the colliding
// entries with their names (staff see them), a coded 422 explains itself; nothing is saved.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
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
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { zonedInstant } from '@vereino/core'
import type { EventGroupOption } from '../../../activities/lib/member-event'
import type { ScheduleConflict } from '../../../activities/components/client-helpers'
import {
  EVENT_NAME_MAX,
  EVENT_OPTIONS_URL,
  EVENT_TYPES,
  PURPOSE_MAX,
  PURPOSE_MIN,
  bookingConflicts,
  bookingErrorMessage,
  createGroupEvent,
  createInternalBooking,
  entryLabel,
  entryRange,
  externalTeams,
  useBookingSections,
  type BookingConflict,
  type CalendarPlace,
  type WriteResult,
} from './places-client'

type Mode = 'general' | 'group'

type Problems = Partial<Record<'purpose' | 'sectionId' | 'groupId' | 'name', string>>

function useGroupOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['facilities-group-event-options'],
    enabled,
    queryFn: async (): Promise<EventGroupOption[]> => {
      const call = await apiCall<{ groups?: EventGroupOption[] }>(EVENT_OPTIONS_URL, {
        headers: { 'x-om-forbidden-redirect': '0' },
      })
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result.groups ?? []
    },
  })
}

function useTeams(enabled: boolean) {
  return useQuery({
    queryKey: ['facilities-group-event-teams'],
    enabled,
    queryFn: () => externalTeams().catch(() => []),
  })
}

function isScheduleConflicts(value: unknown): value is ScheduleConflict[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === 'object' && Array.isArray((item as ScheduleConflict).sessions))
  )
}

function Problem({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null
  return (
    <p id={id} className="text-destructive text-sm">
      {text}
    </p>
  )
}

export function BookingConflictList({
  conflicts,
  timeZone,
}: {
  conflicts: readonly BookingConflict[]
  timeZone: string
}) {
  const t = useT()
  return (
    <ul className="flex flex-col gap-1" data-testid="club-place-conflict-items">
      {conflicts.map((conflict) => (
        <li key={`${conflict.kind}:${conflict.id}`} className="break-words">
          {t('facilities.places.conflicts.item', {
            kind: t(`facilities.places.kind.${conflict.kind}`),
            time: entryRange(conflict, timeZone),
            label: entryLabel(t, conflict),
          })}
        </li>
      ))}
    </ul>
  )
}

/** The sessions and blocks a group's event collides with (409 `occurrence_place_conflict` of `activities`). */
function GroupConflictList({ conflicts, timeZone }: { conflicts: readonly ScheduleConflict[]; timeZone: string }) {
  const t = useT()
  const items = conflicts.flatMap((conflict) => [
    ...conflict.sessions.map((session) => ({
      key: `session:${session.id}`,
      kind: 'session' as const,
      time: entryRange({ start: session.startAt, end: session.endAt }, timeZone),
      label: session.activityName ?? t('facilities.places.entry.unnamed'),
    })),
    ...conflict.blocks.map((block) => ({
      key: `block:${block.id}`,
      kind: block.reason,
      time: entryRange({ start: block.startAt, end: block.endAt }, timeZone),
      label: t(`facilities.places.kind.${block.reason}`),
    })),
  ])
  return (
    <ul className="flex flex-col gap-1" data-testid="club-place-conflict-items">
      {items.map((item) => (
        <li key={item.key} className="break-words">
          {item.kind === 'session'
            ? t('facilities.places.conflicts.item', {
                kind: t('facilities.places.kind.session'),
                time: item.time,
                label: item.label,
              })
            : t('facilities.places.conflicts.block', { kind: item.label, time: item.time })}
        </li>
      ))}
    </ul>
  )
}

export function BookDialog({
  open,
  onOpenChange,
  place,
  date,
  from,
  to,
  timeZone,
  groupEvents,
  onBooked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  place: CalendarPlace
  date: string
  from: string
  to: string
  timeZone: string
  groupEvents: boolean
  onBooked: () => void
}) {
  const t = useT()
  const id = React.useId()
  const groupAllowed = groupEvents && place.isLeaf
  const [mode, setMode] = React.useState<Mode>('general')
  const [purpose, setPurpose] = React.useState('')
  const [chosenSectionId, setSectionId] = React.useState('')
  const [chosenGroupId, setGroupId] = React.useState('')
  const [type, setType] = React.useState<string>('tournament')
  const [name, setName] = React.useState('')
  const [teamIds, setTeamIds] = React.useState<string[]>([])
  const [problems, setProblems] = React.useState<Problems>({})
  const [error, setError] = React.useState<string | null>(null)
  const [conflicts, setConflicts] = React.useState<BookingConflict[] | null>(null)
  const [groupConflicts, setGroupConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [pending, setPending] = React.useState(false)
  const sections = useBookingSections(open)
  const groups = useGroupOptions(open && groupAllowed)
  const teams = useTeams(open && groupAllowed && mode === 'group' && type === 'tournament')

  // The first section (the coordinated ones come first) and a single group are chosen for the user.
  const sectionId = chosenSectionId || (sections.data?.[0]?.id ?? '')
  const groupId = chosenGroupId || (groups.data?.length === 1 ? groups.data[0].id : '')

  const resetOutcome = () => {
    setError(null)
    setConflicts(null)
    setGroupConflicts(null)
  }

  const showResultError = (result: WriteResult) => {
    const found = bookingConflicts(result.answer)
    if (mode === 'group' && isScheduleConflicts(result.answer.conflicts)) {
      setGroupConflicts(result.answer.conflicts)
      setError(t('facilities.places.errors.conflict'))
      return
    }
    if (result.status === 409 && found.length > 0) setConflicts(found)
    if (mode === 'group') {
      const message = typeof result.answer.error === 'string' && result.status === 422 ? result.answer.error : null
      setError(
        result.status === 409
          ? t('facilities.places.errors.conflict')
          : result.status === 403
            ? t('facilities.places.errors.denied')
            : (message ?? t('facilities.places.errors.book')),
      )
      return
    }
    if (result.status === 400) setProblems({ purpose: t('facilities.places.errors.purpose') })
    if (result.answer.code === 'booking_section_invalid')
      setProblems({ sectionId: t('facilities.places.errors.section') })
    setError(bookingErrorMessage(t, result))
  }

  const submit = async () => {
    resetOutcome()
    const startsAt = zonedInstant(date, from, timeZone).toISOString()
    const endsAt = zonedInstant(date, to, timeZone).toISOString()
    const found: Problems = {}
    if (mode === 'general') {
      const trimmed = purpose.trim()
      if (trimmed.length < PURPOSE_MIN || trimmed.length > PURPOSE_MAX)
        found.purpose = t('facilities.places.errors.purpose')
      if (!sectionId) found.sectionId = t('facilities.places.errors.required')
    } else {
      if (!groupId) found.groupId = t('facilities.places.errors.required')
      if (!name.trim()) found.name = t('facilities.places.errors.required')
    }
    setProblems(found)
    const firstField = (['purpose', 'sectionId', 'groupId', 'name'] as const).find((field) => found[field])
    if (firstField) {
      window.setTimeout(() => document.getElementById(`${id}-${firstField}`)?.focus(), 0)
      return
    }
    setPending(true)
    const result =
      mode === 'general'
        ? await createInternalBooking({ placeId: place.id, startsAt, endsAt, sectionId, purpose: purpose.trim() })
        : await createGroupEvent({
            groupId,
            type,
            name: name.trim(),
            placeId: place.id,
            startsAt,
            endsAt,
            invitedExternalTeamIds: type === 'tournament' ? [...new Set(teamIds)] : [],
            description: null,
          })
    setPending(false)
    if (result.ok) {
      onBooked()
      return
    }
    showResultError(result)
  }

  const describedBy = (field: keyof Problems) => (problems[field] ? `${id}-${field}-problem` : undefined)
  const groupList = groups.data ?? []
  const teamList = teams.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('facilities.places.book.close')} data-testid="club-place-book-dialog">
        <DialogHeader>
          <DialogTitle>{t('facilities.places.book.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.places.book.range', { place: place.name, date, time: `${from}–${to}` })}
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${id}-form`}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {groupAllowed ? (
            <fieldset className="flex flex-col gap-2">
              <legend id={`${id}-mode`} className="mb-1 text-sm font-medium">
                {t('facilities.places.book.mode')}
              </legend>
              <RadioGroup
                aria-labelledby={`${id}-mode`}
                className="flex flex-col gap-2 sm:flex-row"
                value={mode}
                onValueChange={(value) => {
                  setMode(value === 'group' ? 'group' : 'general')
                  setProblems({})
                  resetOutcome()
                }}
              >
                {(['group', 'general'] as const).map((entry) => (
                  <label
                    key={entry}
                    htmlFor={`${id}-mode-${entry}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                    data-testid={`club-place-book-mode-${entry}`}
                  >
                    <Radio id={`${id}-mode-${entry}`} value={entry} />
                    <span className="text-sm font-medium">{t(`facilities.places.book.mode.${entry}`)}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}
          {mode === 'general' ? (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-purpose`}>{t('facilities.places.book.purpose')}</Label>
                <Input
                  id={`${id}-purpose`}
                  className="min-h-11"
                  value={purpose}
                  maxLength={PURPOSE_MAX}
                  aria-invalid={problems.purpose ? true : undefined}
                  aria-describedby={describedBy('purpose') ?? `${id}-purpose-help`}
                  onChange={(event) => {
                    setPurpose(event.target.value)
                    setProblems((current) => ({ ...current, purpose: undefined }))
                  }}
                  data-testid="club-place-book-purpose"
                />
                <p id={`${id}-purpose-help`} className="text-muted-foreground text-xs">
                  {t('facilities.places.book.purposeHelp', { min: PURPOSE_MIN, max: PURPOSE_MAX })}
                </p>
                <Problem id={`${id}-purpose-problem`} text={problems.purpose} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-sectionId`}>{t('facilities.places.book.section')}</Label>
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger
                    id={`${id}-sectionId`}
                    className="min-h-11 w-full"
                    aria-invalid={problems.sectionId ? true : undefined}
                    aria-describedby={describedBy('sectionId')}
                    data-testid="club-place-book-section"
                  >
                    <SelectValue placeholder={t('facilities.places.book.chooseSection')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(sections.data ?? []).map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sections.isError ? (
                  <p className="text-destructive text-sm">{t('facilities.places.errors.options')}</p>
                ) : null}
                <Problem id={`${id}-sectionId-problem`} text={problems.sectionId} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-groupId`}>{t('facilities.places.book.group')}</Label>
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger
                    id={`${id}-groupId`}
                    className="min-h-11 w-full"
                    aria-invalid={problems.groupId ? true : undefined}
                    aria-describedby={describedBy('groupId')}
                    data-testid="club-place-book-group"
                  >
                    <SelectValue placeholder={t('facilities.places.book.chooseGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupList.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.sectionName ? `${group.name} · ${group.sectionName}` : group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {groups.data && groupList.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('facilities.places.book.noGroups')}</p>
                ) : null}
                {groups.isError ? (
                  <p className="text-destructive text-sm">{t('facilities.places.errors.options')}</p>
                ) : null}
                <Problem id={`${id}-groupId-problem`} text={problems.groupId} />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend id={`${id}-type`} className="mb-1 text-sm font-medium">
                  {t('facilities.places.book.type')}
                </legend>
                <RadioGroup
                  aria-labelledby={`${id}-type`}
                  className="flex flex-col gap-2 sm:flex-row"
                  value={type}
                  onValueChange={setType}
                >
                  {EVENT_TYPES.map((entry) => (
                    <label
                      key={entry}
                      htmlFor={`${id}-type-${entry}`}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <Radio id={`${id}-type-${entry}`} value={entry} />
                      <span className="text-sm font-medium">{t(`facilities.places.book.type.${entry}`)}</span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-name`}>{t('facilities.places.book.name')}</Label>
                <Input
                  id={`${id}-name`}
                  className="min-h-11"
                  value={name}
                  maxLength={EVENT_NAME_MAX}
                  aria-invalid={problems.name ? true : undefined}
                  aria-describedby={describedBy('name')}
                  onChange={(event) => {
                    setName(event.target.value)
                    setProblems((current) => ({ ...current, name: undefined }))
                  }}
                  data-testid="club-place-book-name"
                />
                <Problem id={`${id}-name-problem`} text={problems.name} />
              </div>
              {type === 'tournament' && teamList.length > 0 ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">{t('facilities.places.book.teams')}</legend>
                  {teamList.map((team) => {
                    const checkboxId = `${id}-team-${team.value}`
                    return (
                      <label
                        key={team.value}
                        htmlFor={checkboxId}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={teamIds.includes(team.value)}
                          onCheckedChange={(value) => {
                            setTeamIds((current) =>
                              value === true
                                ? [...current, team.value]
                                : current.filter((entry) => entry !== team.value),
                            )
                          }}
                        />
                        <span className="text-sm break-words">{team.label}</span>
                      </label>
                    )
                  })}
                </fieldset>
              ) : null}
            </>
          )}
          {error ? (
            <Alert status="error" data-testid="club-place-book-error">
              <AlertTitle>{error}</AlertTitle>
              {(conflicts && conflicts.length > 0) || groupConflicts ? (
                <AlertDescription className="flex flex-col gap-2" data-testid="club-place-conflicts">
                  <span>{t('facilities.places.conflicts.help')}</span>
                  {groupConflicts ? (
                    <GroupConflictList conflicts={groupConflicts} timeZone={timeZone} />
                  ) : (
                    <BookingConflictList conflicts={conflicts ?? []} timeZone={timeZone} />
                  )}
                </AlertDescription>
              ) : null}
            </Alert>
          ) : null}
        </form>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.places.book.cancel')}
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            className="min-h-11"
            disabled={pending}
            data-testid="club-place-book-submit"
          >
            {pending ? t('facilities.places.book.saving') : t('facilities.places.book.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
