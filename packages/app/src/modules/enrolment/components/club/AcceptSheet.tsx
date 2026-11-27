'use client'
// The accept sheet (sign-up form spec M-J3, BR-J4, BR-J6, DD-J10, DD-J11, Q-J06, Q-J08; phase 3, #800): the group (the
// chosen one preselected; each with "x / limit", the age fit and "full"), the start day (by default the group's next
// session day, phase 4 #801; today at the earliest, never after the season the application counts for), the child (or the adult) and the guardian as a new person or a
// possible duplicate the club already has, the fee line of the group (the fee valid today and the rule that the
// existing schedule charges from the start day, no part-month reduction), the account invitation (on; off when the
// person already has an account; a new guardian's birth date, which an account needs) and, for a full group, the
// warning with "Accept beyond the limit". Sends the `updatedAt` the page was read with; a refused input, a full group
// or an overlap stays in the sheet, a 409 "changed by someone else" and a 404 go to the page.
import * as React from 'react'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { SheetContent } from '@/components/ui/dialog'
import { needsOverLimit } from '../../lib/accept'
import {
  acceptApplication,
  calendarDateLabel,
  moneyLabel,
  type AcceptOutcome,
  type ApplicationDetail,
} from './applications-client'
import type { SheetSide } from './DecisionSheets'

type AcceptSheetProps = {
  application: ApplicationDetail
  open: boolean
  side: SheetSide
  onOpenChange: (open: boolean) => void
  /** Every outcome but a refused input, which the sheet shows itself. */
  onOutcome: (outcome: AcceptOutcome) => void
}

const SHEET_CLASS: Record<SheetSide, string> = {
  bottom: 'max-h-dvh rounded-t-xl',
  right: 'w-full sm:max-w-md',
}

const KNOWN_PROBLEMS = new Set([
  'group_full',
  'participant_already_in_group',
  'guardianship_duplicate',
  'start_day_invalid',
  'application_group_invalid',
  'accept_person_invalid',
  'invitation_birth_date_required',
])

type Candidate = ApplicationDetail['duplicates'][number]

function PersonChoice({
  legend,
  name,
  candidates,
  value,
  onChange,
  testId,
}: {
  legend: string
  name: string
  candidates: Candidate[]
  value: string | null
  onChange: (personId: string | null) => void
  testId: string
}) {
  const t = useT()
  const locale = useLocale()
  const options: Array<{ id: string | null; label: string; detail: string | null }> = [
    { id: null, label: t('enrolment.club.accept.newPerson'), detail: null },
    ...candidates
      .filter(
        (entry, index) =>
          entry.name !== null && candidates.findIndex((other) => other.personId === entry.personId) === index,
      )
      .map((entry) => ({
        id: entry.personId,
        label: t('enrolment.club.accept.existingPerson', { name: entry.name ?? '' }),
        detail: [
          t(`enrolment.club.duplicateReason.${entry.reason}`),
          entry.birthDate ? calendarDateLabel(entry.birthDate, locale) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
  ]
  return (
    <fieldset className="flex flex-col gap-2" data-testid={testId}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((option) => {
        const id = `${name}-${option.id ?? 'new'}`
        return (
          <label
            key={id}
            htmlFor={id}
            className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 ${value === option.id ? 'border-primary bg-muted' : ''}`}
            data-person-id={option.id ?? 'new'}
          >
            <input
              id={id}
              type="radio"
              name={name}
              className="mt-0.5 size-5"
              checked={value === option.id}
              onChange={() => {
                onChange(option.id)
              }}
            />
            <span className="flex flex-col">
              <span className="font-medium">{option.label}</span>
              {option.detail ? <span className="text-muted-foreground text-sm">{option.detail}</span> : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

export function AcceptSheet({ application, open, side, onOpenChange, onOutcome }: AcceptSheetProps) {
  const t = useT()
  const locale = useLocale()
  const id = React.useId()
  const initialGroup =
    application.groupId && application.groups.some((group) => group.id === application.groupId)
      ? application.groupId
      : (application.groups[0]?.id ?? null)
  const [groupId, setGroupId] = React.useState<string | null>(initialGroup)
  // The group's next session day while the decider has not picked a day (phase 4, `upcomingSessionsOfGroup`).
  const defaultStart = (target: string | null): string => {
    const next = application.groups.find((group) => group.id === target)?.nextSessionDay
    const inSeason =
      !application.seasonEndsOn || (next !== null && next !== undefined && next <= application.seasonEndsOn)
    return next && next >= application.today && inSeason ? next : application.today
  }
  const [startDay, setStartDay] = React.useState(() => defaultStart(initialGroup))
  const [startTouched, setStartTouched] = React.useState(false)
  const [childId, setChildId] = React.useState<string | null>(null)
  const [guardianId, setGuardianId] = React.useState<string | null>(null)
  const [guardianBirthDate, setGuardianBirthDate] = React.useState('')
  const [invite, setInvite] = React.useState(true)
  const [overLimit, setOverLimit] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const child = application.kind === 'child'
  const participants = application.duplicates.filter((entry) => entry.role === 'participant')
  const guardians = application.duplicates.filter((entry) => entry.role === 'guardian')
  const group = application.groups.find((entry) => entry.id === groupId) ?? null
  const full = group ? needsOverLimit(group) : false
  const inviteeId = child ? guardianId : childId
  const inviteeHasAccount = inviteeId
    ? application.duplicates.some((entry) => entry.personId === inviteeId && entry.hasAccount)
    : false
  const asksBirthDate = child && guardianId === null && invite && !inviteeHasAccount

  const submit = async () => {
    if (pending) return
    if (!groupId) {
      setProblem(t('enrolment.club.waiting.chooseGroup'))
      return
    }
    if (full && !overLimit) {
      setProblem(t('enrolment.errors.group_full'))
      return
    }
    if (asksBirthDate && !guardianBirthDate) {
      setProblem(t('enrolment.errors.invitation_birth_date_required'))
      return
    }
    setPending(true)
    setProblem(null)
    const outcome = await acceptApplication(application.id, {
      groupId,
      startDay,
      childPersonId: childId,
      guardianPersonId: child ? guardianId : null,
      guardianBirthDate: asksBirthDate ? guardianBirthDate : null,
      overLimit: full && overLimit,
      sendInvitation: invite && !inviteeHasAccount,
      updatedAt: application.updatedAt,
    })
    setPending(false)
    if (outcome.status === 'invalid') {
      setProblem(
        outcome.code && KNOWN_PROBLEMS.has(outcome.code)
          ? t(`enrolment.errors.${outcome.code}`)
          : t('enrolment.club.errors.decision'),
      )
      return
    }
    if (outcome.status === 'error') {
      setProblem(t('enrolment.club.errors.decision'))
      return
    }
    onOutcome(outcome)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <SheetContent
        side={side}
        className={SHEET_CLASS[side]}
        closeLabel={t('enrolment.club.actions.close')}
        data-testid="enrolment-accept-sheet"
      >
        <SheetHeader>
          <SheetTitle>{t('enrolment.club.accept.title')}</SheetTitle>
          <SheetDescription>{t('enrolment.club.accept.help')}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
          {application.groups.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('enrolment.club.waiting.noGroups')}</p>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('enrolment.club.waiting.group')}</legend>
              {application.groups.map((entry) => {
                const checked = groupId === entry.id
                return (
                  <label
                    key={entry.id}
                    htmlFor={`${id}-group-${entry.id}`}
                    className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-3 ${checked ? 'border-primary bg-muted' : ''}`}
                    data-testid="enrolment-accept-group"
                    data-group-id={entry.id}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        id={`${id}-group-${entry.id}`}
                        type="radio"
                        name={`${id}-group`}
                        className="size-5"
                        checked={checked}
                        onChange={() => {
                          setGroupId(entry.id)
                          if (!startTouched) setStartDay(defaultStart(entry.id))
                          setOverLimit(false)
                          setProblem(null)
                        }}
                      />
                      <span className="font-medium">{entry.name}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 ps-7 text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {entry.placesLimit === null
                          ? t('enrolment.club.waiting.places', { occupied: entry.occupied })
                          : t('enrolment.club.waiting.placesOf', {
                              occupied: entry.occupied,
                              limit: entry.placesLimit,
                            })}
                      </span>
                      {entry.full ? <StatusTag status="warning">{t('enrolment.club.waiting.full')}</StatusTag> : null}
                      {entry.ageFit === 'outside' ? (
                        <StatusTag status="warning">{t('enrolment.flags.outside_age')}</StatusTag>
                      ) : null}
                      {entry.ageFit === 'fits' ? (
                        <StatusTag status="success">{t('enrolment.club.waiting.fits')}</StatusTag>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}

          {group ? (
            <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm" data-testid="enrolment-accept-fee">
              <span className="font-medium">{t('enrolment.club.accept.fee')}</span>
              {group.fees.length > 0 ? (
                group.fees.map((fee) => (
                  <span key={`${fee.period}-${String(fee.amount)}`}>
                    {t(`enrolment.club.accept.feePeriod.${fee.period}`, { amount: moneyLabel(fee.amount, locale) })}
                  </span>
                ))
              ) : (
                <span>{t('enrolment.club.accept.feeUnknown')}</span>
              )}
              <span className="text-muted-foreground">{t('enrolment.club.accept.feeRule')}</span>
            </div>
          ) : null}

          {full ? (
            <Alert style="light" status="warning" data-testid="enrolment-accept-full">
              <AlertDescription>
                <div className="flex flex-col gap-2">
                  <span>{t('enrolment.club.accept.fullWarning')}</span>
                  <label className="flex min-h-11 items-center gap-2" htmlFor={`${id}-over`}>
                    <input
                      id={`${id}-over`}
                      type="checkbox"
                      className="size-5"
                      checked={overLimit}
                      onChange={(event) => {
                        setOverLimit(event.target.checked)
                        setProblem(null)
                      }}
                      data-testid="enrolment-accept-over-limit"
                    />
                    <span>{t('enrolment.club.accept.overLimit')}</span>
                  </label>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{t('enrolment.club.accept.startDay')}</Label>
            <Input
              id={`${id}-start`}
              type="date"
              value={startDay}
              min={application.today}
              max={application.seasonEndsOn ?? undefined}
              required
              onChange={(event) => {
                setStartDay(event.target.value)
                setStartTouched(true)
                setProblem(null)
              }}
              data-testid="enrolment-accept-start-day"
            />
          </div>

          <PersonChoice
            legend={child ? t('enrolment.club.accept.child') : t('enrolment.club.accept.adult')}
            name={`${id}-child`}
            candidates={participants}
            value={childId}
            onChange={(personId) => {
              setChildId(personId)
              setProblem(null)
            }}
            testId="enrolment-accept-child"
          />
          {child ? (
            <PersonChoice
              legend={t('enrolment.club.accept.guardian')}
              name={`${id}-guardian`}
              candidates={guardians}
              value={guardianId}
              onChange={(personId) => {
                setGuardianId(personId)
                setProblem(null)
              }}
              testId="enrolment-accept-guardian"
            />
          ) : null}

          <label className="flex min-h-11 items-center gap-2" htmlFor={`${id}-invite`}>
            <input
              id={`${id}-invite`}
              type="checkbox"
              className="size-5"
              checked={invite && !inviteeHasAccount}
              disabled={inviteeHasAccount}
              onChange={(event) => {
                setInvite(event.target.checked)
                setProblem(null)
              }}
              data-testid="enrolment-accept-invite"
            />
            <span className="flex flex-col">
              <span>{t('enrolment.club.accept.invite')}</span>
              {inviteeHasAccount ? (
                <span className="text-muted-foreground text-sm">{t('enrolment.club.accept.hasAccount')}</span>
              ) : null}
            </span>
          </label>
          {asksBirthDate ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-birth`}>{t('enrolment.club.accept.guardianBirthDate')}</Label>
              <Input
                id={`${id}-birth`}
                type="date"
                value={guardianBirthDate}
                max={application.today}
                onChange={(event) => {
                  setGuardianBirthDate(event.target.value)
                  setProblem(null)
                }}
                data-testid="enrolment-accept-guardian-birth-date"
              />
              <span className="text-muted-foreground text-xs">{t('enrolment.club.accept.guardianBirthDateHelp')}</span>
            </div>
          ) : null}

          {problem ? (
            <Alert style="light" status="error" data-testid="enrolment-accept-problem">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('enrolment.club.actions.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending || application.groups.length === 0}
            data-testid="enrolment-accept-submit"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('enrolment.club.actions.saving') : t('enrolment.club.accept.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
