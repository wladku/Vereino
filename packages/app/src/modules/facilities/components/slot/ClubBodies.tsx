'use client'
// The club kinds of the slot dialog (facilities parity spec `SlotDialog`, DD-R04, DD-R05; README M-11; #277), the bodies
// of the former "Book" dialog (#123). "For a group": one of the user's own groups, the type, the name (at least 3
// characters) and the invited teams, posted to `POST /api/activities/events` as a home event on the chosen place.
// "General purpose": a purpose of 3–120 characters and a section, posted to `POST /api/facilities/internal-bookings`.
// A 409 lists the colliding entries ("from–to label"); the success message adds how many held requests the booking
// superseded (`ui.slotModal.supersededN`).
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import type { EventGroupOption } from '../../../activities/lib/member-event'
import {
  EVENT_TYPES,
  PURPOSE_MAX,
  PURPOSE_MIN,
  bookingConflicts,
  bookingErrorMessage,
  createGroupEvent,
  createInternalBooking,
  externalTeams,
  useBookingSections,
  type Translate,
  type WriteResult,
} from '../club-places/places-client'
import { bookingCollisionLines, eventCollisionLines, isScheduleConflicts } from './slot-client'
import type { SlotBodyProps } from './slot-types'

/** A group event's name: at least 3 characters (`ui.slotModal.errName`), at most 200. */
const NAME_MIN = 3
const NAME_MAX = 200

/** What the success message names: the place, the date and the times as the user sees them. */
export type SlotText = { place: string; date: string; start: string; end: string }

/** " Superseded 2 external requests." — empty when none. */
export function supersededText(t: Translate, locale: string, count: number): string {
  if (count <= 0) return ''
  const form = new Intl.PluralRules(locale).select(count)
  const plural = form === 'one' || form === 'few' || form === 'many' ? form : 'other'
  return ` ${t(`facilities.slot.supersededN.${plural}`, { n: count })}`
}

function Problem({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null
  return (
    <p id={id} className="text-destructive text-sm" role="alert">
      {text}
    </p>
  )
}

function useTeams(enabled: boolean) {
  return useQuery({
    queryKey: ['facilities-group-event-teams'],
    enabled,
    queryFn: () => externalTeams().catch(() => []),
  })
}

/** The collisions or the coded message of a refused club write. */
function reportRefusal(
  t: Translate,
  result: WriteResult,
  timeZone: string,
  report: SlotBodyProps['report'],
  fallback: string,
): void {
  if (isScheduleConflicts(result.answer.conflicts)) {
    report.collisions(eventCollisionLines(t, result.answer.conflicts, timeZone))
    return
  }
  const found = bookingConflicts(result.answer)
  if (result.status === 409 && found.length > 0) {
    report.collisions(bookingCollisionLines(t, found, timeZone))
    return
  }
  report.problem(fallback)
}

export function GroupBody({
  formId,
  placeId,
  startsAt,
  endsAt,
  timeZone,
  disabled,
  report,
  onDone,
  groups,
  heldRequests,
  slot,
}: SlotBodyProps & { groups: readonly EventGroupOption[]; heldRequests: number; slot: SlotText }) {
  const t = useT()
  const locale = useLocale()
  const id = React.useId()
  const [chosenGroupId, setGroupId] = React.useState('')
  const [type, setType] = React.useState<string>('tournament')
  const [name, setName] = React.useState('')
  const [teamIds, setTeamIds] = React.useState<string[]>([])
  const [problems, setProblems] = React.useState<Partial<Record<'groupId' | 'name', string>>>({})
  const teams = useTeams(true)
  // A single group, or the first team, is chosen for the user.
  const groupId =
    chosenGroupId ||
    (groups.length === 1 ? (groups[0]?.id ?? '') : (groups.find((group) => group.kind === 'team')?.id ?? ''))

  const submit = async () => {
    report.collisions(null)
    report.problem(null)
    const found: Partial<Record<'groupId' | 'name', string>> = {}
    if (!groupId) found.groupId = t('facilities.places.errors.required')
    if (name.trim().length < NAME_MIN) found.name = t('facilities.slot.errors.name')
    setProblems(found)
    const first = (['groupId', 'name'] as const).find((field) => found[field])
    if (first) {
      window.setTimeout(() => document.getElementById(`${id}-${first}`)?.focus(), 0)
      return
    }
    if (!startsAt || !endsAt) {
      report.problem(t('facilities.slot.errors.times'))
      return
    }
    report.pending(true)
    const result = await createGroupEvent({
      groupId,
      type,
      name: name.trim(),
      placeId,
      startsAt,
      endsAt,
      invitedExternalTeamIds: [...new Set(teamIds)],
      description: null,
    })
    report.pending(false)
    if (result.ok) {
      const group = groups.find((entry) => entry.id === groupId)?.name ?? ''
      await onDone(
        `${t('facilities.slot.saved.group', { name: name.trim(), ...slot, group })}${supersededText(t, locale, heldRequests)}`,
      )
      return
    }
    const message = typeof result.answer.error === 'string' && result.status === 422 ? result.answer.error : null
    reportRefusal(
      t,
      result,
      timeZone,
      report,
      result.status === 403 ? t('facilities.places.errors.denied') : (message ?? t('facilities.places.errors.book')),
    )
  }

  const describedBy = (field: 'groupId' | 'name') => (problems[field] ? `${id}-${field}-problem` : undefined)
  const teamList = teams.data ?? []

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-groupId`}>{t('facilities.places.book.group')}</Label>
          <Select value={groupId} onValueChange={setGroupId} disabled={disabled}>
            <SelectTrigger
              id={`${id}-groupId`}
              className="min-h-11 w-full"
              aria-invalid={problems.groupId ? true : undefined}
              aria-describedby={describedBy('groupId')}
              data-testid="facilities-slot-group"
            >
              <SelectValue placeholder={t('facilities.places.book.chooseGroup')} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.sectionName ? `${group.name} · ${group.sectionName}` : group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            disabled={disabled}
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
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-name`}>{t('facilities.places.book.name')}</Label>
        <Input
          id={`${id}-name`}
          className="min-h-11"
          value={name}
          maxLength={NAME_MAX}
          disabled={disabled}
          aria-invalid={problems.name ? true : undefined}
          aria-describedby={describedBy('name')}
          onChange={(event) => {
            setName(event.target.value)
            setProblems((current) => ({ ...current, name: undefined }))
          }}
          data-testid="facilities-slot-name"
        />
        <Problem id={`${id}-name-problem`} text={problems.name} />
      </div>
      {teamList.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('facilities.places.book.teams')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    disabled={disabled}
                    onCheckedChange={(value) => {
                      setTeamIds((current) =>
                        value === true ? [...current, team.value] : current.filter((entry) => entry !== team.value),
                      )
                    }}
                  />
                  <span className="text-sm break-words">{team.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}
    </form>
  )
}

export function GeneralBody({
  formId,
  placeId,
  startsAt,
  endsAt,
  timeZone,
  disabled,
  report,
  onDone,
  slot,
}: SlotBodyProps & { slot: SlotText }) {
  const t = useT()
  const locale = useLocale()
  const id = React.useId()
  const [purpose, setPurpose] = React.useState('')
  const [chosenSectionId, setSectionId] = React.useState('')
  const [problems, setProblems] = React.useState<Partial<Record<'purpose' | 'sectionId', string>>>({})
  const sections = useBookingSections(true)
  // The first section (the coordinated ones come first) is chosen for the user.
  const sectionId = chosenSectionId || (sections.data?.[0]?.id ?? '')

  const submit = async () => {
    report.collisions(null)
    report.problem(null)
    const found: Partial<Record<'purpose' | 'sectionId', string>> = {}
    const trimmed = purpose.trim()
    if (trimmed.length < PURPOSE_MIN || trimmed.length > PURPOSE_MAX)
      found.purpose = t('facilities.slot.errors.purpose')
    if (!sectionId) found.sectionId = t('facilities.places.errors.required')
    setProblems(found)
    const first = (['purpose', 'sectionId'] as const).find((field) => found[field])
    if (first) {
      window.setTimeout(() => document.getElementById(`${id}-${first}`)?.focus(), 0)
      return
    }
    if (!startsAt || !endsAt) {
      report.problem(t('facilities.slot.errors.times'))
      return
    }
    report.pending(true)
    const result = await createInternalBooking({ placeId, startsAt, endsAt, sectionId, purpose: trimmed })
    report.pending(false)
    if (result.ok) {
      const supersededIds = (result.answer as { supersededRequestIds?: unknown }).supersededRequestIds
      const superseded = Array.isArray(supersededIds) ? supersededIds.length : 0
      await onDone(`${t('facilities.slot.saved.general', slot)}${supersededText(t, locale, superseded)}`)
      return
    }
    if (result.status === 400) setProblems({ purpose: t('facilities.slot.errors.purpose') })
    if (result.answer.code === 'booking_section_invalid') {
      setProblems({ sectionId: t('facilities.places.errors.section') })
    }
    if (result.answer.code === 'place_closed' || result.answer.code === 'maintenance_scheduled') {
      report.startIssues([{ code: result.answer.code, text: bookingErrorMessage(t, result), conflicts: [] }])
      report.problem(t('facilities.rentals.errors.refused'))
      return
    }
    reportRefusal(t, result, timeZone, report, bookingErrorMessage(t, result))
  }

  const describedBy = (field: 'purpose' | 'sectionId') => (problems[field] ? `${id}-${field}-problem` : undefined)

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-purpose`}>{t('facilities.places.book.purpose')}</Label>
        <Input
          id={`${id}-purpose`}
          className="min-h-11"
          value={purpose}
          maxLength={PURPOSE_MAX}
          disabled={disabled}
          placeholder={t('facilities.slot.purposePlaceholder')}
          aria-invalid={problems.purpose ? true : undefined}
          aria-describedby={describedBy('purpose') ?? `${id}-purpose-help`}
          onChange={(event) => {
            setPurpose(event.target.value)
            setProblems((current) => ({ ...current, purpose: undefined }))
          }}
          data-testid="facilities-slot-purpose"
        />
        <p id={`${id}-purpose-help`} className="text-muted-foreground text-xs">
          {t('facilities.places.book.purposeHelp', { min: PURPOSE_MIN, max: PURPOSE_MAX })}
        </p>
        <Problem id={`${id}-purpose-problem`} text={problems.purpose} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-sectionId`}>{t('facilities.places.book.section')}</Label>
        <Select value={sectionId} onValueChange={setSectionId} disabled={disabled}>
          <SelectTrigger
            id={`${id}-sectionId`}
            className="min-h-11 w-full"
            aria-invalid={problems.sectionId ? true : undefined}
            aria-describedby={describedBy('sectionId')}
            data-testid="facilities-slot-section"
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
        {sections.isError ? <p className="text-destructive text-sm">{t('facilities.places.errors.options')}</p> : null}
        <Problem id={`${id}-sectionId-problem`} text={problems.sectionId} />
      </div>
    </form>
  )
}
