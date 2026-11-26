'use client'
// `/p/[clubSlug]/sections/[sectionSlug]/apply` — the section sign-up form (sign-up form spec P-J2, BR-J1, BR-J2, DD-J03,
// DD-J04, J-J01, J-J02; #799). Three steps that keep their state when going back:
// 1. who applies (for my child / for myself 18+), the participant's name and birth date, with the age on the reference
//    date and the hard limits of BR-J2 inline;
// 2. the group: matching groups first (the age fit computed here with the server's own rule, DD-J04), then the other
//    groups behind a toggle, a warning (never a block) on a group outside the range, "full — waiting list" on a full
//    group (no counts), "choose a group for us"; the trial-session wish, the experience and a note;
// 3. the contact (the guardian's name for a child), the guardian statement, the club rules and the information on
//    data processing (the club's text or the default one).
// Each step is checked with `applicationSubmitSchema`, the schema the server applies. A refused field (422) brings
// the reader back to the step that holds it. The honeypot `website` is hidden from people and assistive technology.
// Sent: "Check your e-mail — the link is valid for one hour" with "Send again". States: loading, error with retry,
// applications closed (with the way back to the section), too many attempts (with the wait), network error (retry).
import * as React from 'react'
import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { isCalendarDate } from '@vereino/core'
import { StatusTag, privacyPolicyHref } from '@vereino/ui'
import { applicationSubmitSchema } from '../../data/validators'
import { ageFitOf, ageLimitIssue, ageOnReference } from '../../lib/age'
import { NOTE_MAX } from '../../lib/applications'
import { EXPERIENCE_LEVELS, type AgeFit, type ApplicationKind } from '../../lib/states'
import {
  PublicEnrolmentError,
  PublicEnrolmentFrame,
  PublicEnrolmentLoading,
  PublicEnrolmentNotice,
  tooManyText,
} from './PublicEnrolmentFrame'
import {
  formatCalendarDate,
  groupRangeLabel,
  resendConfirmation,
  sectionHref,
  submitApplication,
  usePublicForm,
  type ApplicationBody,
  type PublicFormGroup,
  type PublicFormView,
  type UniformOutcome,
} from './public-client'

const CHOOSE_FOR_US = 'choose_for_us'

const UNKNOWN_FIT: AgeFit = 'unknown'

type Step = 1 | 2 | 3

type Draft = {
  kind: ApplicationKind | ''
  participantFirstName: string
  participantLastName: string
  participantBirthDate: string
  guardianFirstName: string
  guardianLastName: string
  email: string
  phone: string
  guardianStatement: boolean
  /** A group id, `choose_for_us`, or '' while nothing is chosen. */
  choice: string
  wantsTrial: boolean
  experience: string
  note: string
  rulesAccepted: boolean
  privacyAcknowledged: boolean
  website: string
}

const EMPTY_DRAFT: Draft = {
  kind: '',
  participantFirstName: '',
  participantLastName: '',
  participantBirthDate: '',
  guardianFirstName: '',
  guardianLastName: '',
  email: '',
  phone: '',
  guardianStatement: false,
  choice: '',
  wantsTrial: true,
  experience: '',
  note: '',
  rulesAccepted: false,
  privacyAcknowledged: false,
  website: '',
}

type Field =
  | 'kind'
  | 'participantFirstName'
  | 'participantLastName'
  | 'participantBirthDate'
  | 'groupId'
  | 'experience'
  | 'note'
  | 'guardianFirstName'
  | 'guardianLastName'
  | 'email'
  | 'phone'
  | 'guardianStatement'
  | 'rulesAccepted'
  | 'privacyAcknowledged'

const STEP_FIELDS: Record<Step, readonly Field[]> = {
  1: ['kind', 'participantFirstName', 'participantLastName', 'participantBirthDate'],
  2: ['groupId', 'experience', 'note'],
  3: [
    'guardianFirstName',
    'guardianLastName',
    'email',
    'phone',
    'guardianStatement',
    'rulesAccepted',
    'privacyAcknowledged',
  ],
}

const ALL_FIELDS: readonly Field[] = [...STEP_FIELDS[1], ...STEP_FIELDS[2], ...STEP_FIELDS[3]]

/** The field a schema path or an API field name stands for (`chooseForUs` is part of the group choice). */
function fieldOf(name: string): Field | null {
  if (name === 'chooseForUs') return 'groupId'
  return ALL_FIELDS.find((field) => field === name) ?? null
}

function stepOf(field: Field): Step {
  if (STEP_FIELDS[1].includes(field)) return 1
  if (STEP_FIELDS[2].includes(field)) return 2
  return 3
}

/** The message keys of the fields to fix; each a key under `enrolment.public.errors.field`. */
type Errors = Partial<Record<Field, string>>

function bodyOf(draft: Draft, locale: string): ApplicationBody {
  const child = draft.kind === 'child'
  const chooseForUs = draft.choice === CHOOSE_FOR_US
  return {
    kind: draft.kind as ApplicationKind,
    participantFirstName: draft.participantFirstName,
    participantLastName: draft.participantLastName,
    participantBirthDate: draft.participantBirthDate,
    guardianFirstName: child ? draft.guardianFirstName : null,
    guardianLastName: child ? draft.guardianLastName : null,
    email: draft.email,
    phone: draft.phone,
    ...(child ? { guardianStatement: draft.guardianStatement } : {}),
    groupId: chooseForUs || !draft.choice ? null : draft.choice,
    chooseForUs,
    wantsTrial: draft.wantsTrial,
    experience: draft.experience || null,
    note: draft.note.trim() ? draft.note : null,
    rulesAccepted: draft.rulesAccepted,
    privacyAcknowledged: draft.privacyAcknowledged,
    website: draft.website,
    locale,
  }
}

const validBirthDate = (value: string): boolean => isCalendarDate(value)

/** Every field to fix: the server's schema, then the hard age limits of BR-J2 on the form's dates. */
function validate(draft: Draft, form: PublicFormView, locale: string): Errors {
  const errors: Errors = {}
  const parsed = applicationSubmitSchema.safeParse({ ...bodyOf(draft, locale), kind: draft.kind || undefined })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldOf(String(issue.path[0] ?? ''))
      if (field && !errors[field]) errors[field] = field
    }
  }
  // The schema's cross-field rules run only once every field passes, so the steps check them here as well.
  if (!draft.choice) errors.groupId = 'groupId'
  if (draft.kind === 'child') {
    if (!draft.guardianFirstName.trim()) errors.guardianFirstName = 'guardianFirstName'
    if (!draft.guardianLastName.trim()) errors.guardianLastName = 'guardianLastName'
    if (!draft.guardianStatement) errors.guardianStatement = 'guardianStatement'
  }
  if (draft.kind && validBirthDate(draft.participantBirthDate)) {
    const issue = ageLimitIssue(draft.kind, draft.participantBirthDate, form.referenceDate, form.today)
    if (issue === 'birth_date_future') errors.participantBirthDate = 'birthDateFuture'
    else if (issue) errors.participantBirthDate = draft.kind === 'child' ? 'childAge' : 'adultAge'
  }
  return errors
}

const pick = (errors: Errors, fields: readonly Field[]): Errors =>
  Object.fromEntries(fields.filter((field) => errors[field]).map((field) => [field, errors[field]]))

const firstStep = (errors: Errors): Step | null => {
  const fields = Object.keys(errors) as Field[]
  if (fields.length === 0) return null
  return Math.min(...fields.map(stepOf)) as Step
}

const INPUT_CLASS = 'min-h-11'
const SELECT_CLASS =
  'border-input bg-background text-foreground focus-visible:ring-ring min-h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none'
const CHECK_CLASS = 'accent-primary mt-0.5 size-5 shrink-0'
const OPTION_CLASS =
  'has-[:checked]:border-primary has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2'
const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'

function FieldError({ field, errors }: { field: Field; errors: Errors }) {
  const t = useT()
  const key = errors[field]
  if (!key) return null
  return (
    <p
      id={`enrolment-error-${field}`}
      className="text-destructive text-sm"
      role="alert"
      data-testid={`enrolment-field-error-${field}`}
    >
      {t(`enrolment.public.errors.field.${key}`)}
    </p>
  )
}

const invalidProps = (field: Field, errors: Errors) =>
  errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': `enrolment-error-${field}` } : {}

type TextFieldProps = {
  field: Field & keyof Draft
  label: string
  draft: Draft
  errors: Errors
  onChange: (field: keyof Draft, value: string) => void
  type?: string
  autoComplete?: string
  maxLength?: number
  hint?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  max?: string
}

function TextField({
  field,
  label,
  draft,
  errors,
  onChange,
  type = 'text',
  autoComplete,
  maxLength,
  hint,
  inputMode,
  max,
}: TextFieldProps) {
  const id = `enrolment-${field}`
  const value = draft[field]
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field}
        type={type}
        value={typeof value === 'string' ? value : ''}
        autoComplete={autoComplete}
        maxLength={maxLength}
        inputMode={inputMode}
        max={max}
        required
        className={INPUT_CLASS}
        data-testid={`enrolment-${field}`}
        {...invalidProps(field, errors)}
        onChange={(event) => {
          onChange(field, event.target.value)
        }}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <FieldError field={field} errors={errors} />
    </div>
  )
}

function CheckField({
  field,
  label,
  draft,
  errors,
  onToggle,
  children,
}: {
  field: 'guardianStatement' | 'rulesAccepted' | 'privacyAcknowledged' | 'wantsTrial'
  label: string
  draft: Draft
  errors: Errors
  onToggle: (field: keyof Draft, value: boolean) => void
  children?: React.ReactNode
}) {
  const id = `enrolment-${field}`
  const errorField = field === 'wantsTrial' ? null : field
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-start gap-3">
        <input
          id={id}
          name={field}
          type="checkbox"
          className={CHECK_CLASS}
          checked={draft[field]}
          data-testid={`enrolment-${field}`}
          {...(errorField ? invalidProps(errorField, errors) : {})}
          onChange={(event) => {
            onToggle(field, event.target.checked)
          }}
        />
        <Label htmlFor={id} className="leading-snug">
          {label}
        </Label>
      </div>
      {children}
      {errorField ? <FieldError field={errorField} errors={errors} /> : null}
    </div>
  )
}

/** The parts of the default information text on data processing (when the club wrote none). */
const DEFAULT_INFO_PARTS = ['controller', 'purpose', 'basis', 'retention', 'rights', 'contact'] as const

function InformationText({ form }: { form: PublicFormView }) {
  const t = useT()
  const privacy = privacyPolicyHref(form.club.slug, form.privacyPolicyUrl ?? form.club.links.privacyPolicy)
  return (
    <details className="text-sm" data-testid="enrolment-information">
      <summary className="min-h-11 cursor-pointer py-2 underline underline-offset-4 sm:min-h-6">
        {t('enrolment.public.consents.showInformation')}
      </summary>
      <div
        className="bg-muted/50 mt-2 flex flex-col gap-2 rounded-md border p-3"
        data-testid="enrolment-information-text"
      >
        {form.informationText ? (
          <p className="max-w-prose whitespace-pre-line">{form.informationText}</p>
        ) : (
          DEFAULT_INFO_PARTS.map((part) => (
            <p key={part} className="max-w-prose">
              {t(`enrolment.public.information.${part}`, { club: form.club.name })}
            </p>
          ))
        )}
        {form.contactPhone ? <p>{t('enrolment.public.information.phone', { phone: form.contactPhone })}</p> : null}
        <a
          className={LINK_CLASS}
          href={privacy.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="enrolment-privacy-policy"
        >
          {t('enrolment.public.information.policy')}
        </a>
      </div>
    </details>
  )
}

function GroupOption({
  group,
  fit,
  kind,
  checked,
  onChoose,
}: {
  group: PublicFormGroup
  fit: AgeFit
  kind: ApplicationKind | ''
  checked: boolean
  onChoose: (value: string) => void
}) {
  const t = useT()
  const range = groupRangeLabel(group, t)
  const id = `enrolment-group-${group.id}`
  return (
    <li className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={OPTION_CLASS}
        data-testid="enrolment-group-option"
        data-group-id={group.id}
        data-fit={fit}
        data-full={group.full ? 'true' : 'false'}
      >
        <input
          id={id}
          type="radio"
          name="groupId"
          value={group.id}
          className={CHECK_CLASS}
          checked={checked}
          onChange={() => {
            onChoose(group.id)
          }}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-medium break-words">{group.name}</span>
          {range ? <span className="text-muted-foreground text-sm">{range}</span> : null}
          {group.full || fit === 'outside' ? (
            <span className="flex flex-wrap gap-1">
              {group.full ? <StatusTag status="info">{t('enrolment.public.group.full')}</StatusTag> : null}
              {fit === 'outside' ? <StatusTag status="warning">{t('enrolment.public.group.outside')}</StatusTag> : null}
            </span>
          ) : null}
        </span>
      </label>
      {checked && fit === 'outside' ? (
        <p className="text-status-warning-text text-sm" role="status" data-testid="enrolment-outside-warning">
          {t(
            kind === 'adult' ? 'enrolment.public.group.outsideWarningAdult' : 'enrolment.public.group.outsideWarning',
            {
              range: range ?? '',
            },
          )}
        </p>
      ) : null}
    </li>
  )
}

function StepGroups({
  form,
  draft,
  errors,
  onChange,
  onToggle,
}: {
  form: PublicFormView
  draft: Draft
  errors: Errors
  onChange: (field: keyof Draft, value: string) => void
  onToggle: (field: keyof Draft, value: boolean) => void
}) {
  const t = useT()
  const birthDate = validBirthDate(draft.participantBirthDate) ? draft.participantBirthDate : null
  const fitted = form.groups.map((group) => ({
    group,
    fit: birthDate ? ageFitOf(birthDate, form.referenceDate, group.fitRule) : UNKNOWN_FIT,
  }))
  const matching = fitted.filter((entry) => entry.fit === 'fits')
  const others = fitted.filter((entry) => entry.fit !== 'fits')
  const chosenInOthers = others.some((entry) => entry.group.id === draft.choice)
  const [showOthers, setShowOthers] = React.useState(matching.length === 0 || chosenInOthers)
  const othersOpen = showOthers || matching.length === 0 || chosenInOthers
  const choose = (value: string) => {
    onChange('choice', value)
  }
  return (
    <fieldset className="flex flex-col gap-4" {...invalidProps('groupId', errors)}>
      <legend className="sr-only">{t('enrolment.public.step2.legend')}</legend>
      {matching.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{t('enrolment.public.group.matching')}</h3>
          <ul className="flex flex-col gap-2" data-testid="enrolment-groups-matching">
            {matching.map(({ group, fit }) => (
              <GroupOption
                key={group.id}
                group={group}
                fit={fit}
                kind={draft.kind}
                checked={draft.choice === group.id}
                onChoose={choose}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="enrolment-groups-none-matching">
          {t('enrolment.public.group.noneMatching')}
        </p>
      )}
      {others.length > 0 ? (
        <div className="flex flex-col gap-2">
          {matching.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              aria-expanded={othersOpen}
              aria-controls="enrolment-groups-others"
              disabled={chosenInOthers}
              data-testid="enrolment-groups-toggle"
              onClick={() => {
                setShowOthers((open) => !open)
              }}
            >
              {othersOpen ? t('enrolment.public.group.hideOthers') : t('enrolment.public.group.showOthers')}
            </Button>
          ) : (
            <h3 className="font-semibold">{t('enrolment.public.group.all')}</h3>
          )}
          {othersOpen ? (
            <ul id="enrolment-groups-others" className="flex flex-col gap-2" data-testid="enrolment-groups-others">
              {others.map(({ group, fit }) => (
                <GroupOption
                  key={group.id}
                  group={group}
                  fit={fit}
                  kind={draft.kind}
                  checked={draft.choice === group.id}
                  onChoose={choose}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <label htmlFor="enrolment-choose-for-us" className={OPTION_CLASS} data-testid="enrolment-group-choose-for-us">
        <input
          id="enrolment-choose-for-us"
          type="radio"
          name="groupId"
          value={CHOOSE_FOR_US}
          className={CHECK_CLASS}
          checked={draft.choice === CHOOSE_FOR_US}
          onChange={() => {
            choose(CHOOSE_FOR_US)
          }}
        />
        <span className="flex flex-col gap-1 font-medium">
          {t('enrolment.public.group.chooseForUs')}
          <span className="text-muted-foreground text-sm font-normal">
            {t('enrolment.public.group.chooseForUsHint')}
          </span>
        </span>
      </label>
      <FieldError field="groupId" errors={errors} />

      <CheckField
        field="wantsTrial"
        label={t('enrolment.public.fields.wantsTrial')}
        draft={draft}
        errors={errors}
        onToggle={onToggle}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor="enrolment-experience">{t('enrolment.public.fields.experience')}</Label>
        <select
          id="enrolment-experience"
          name="experience"
          className={SELECT_CLASS}
          value={draft.experience}
          data-testid="enrolment-experience"
          {...invalidProps('experience', errors)}
          onChange={(event) => {
            onChange('experience', event.target.value)
          }}
        >
          <option value="">{t('enrolment.public.experience.unset')}</option>
          {EXPERIENCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`enrolment.public.experience.${level}`)}
            </option>
          ))}
        </select>
        <FieldError field="experience" errors={errors} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="enrolment-note">{t('enrolment.public.fields.note')}</Label>
        <Textarea
          id="enrolment-note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          value={draft.note}
          data-testid="enrolment-note"
          aria-describedby="enrolment-note-hint"
          {...invalidProps('note', errors)}
          onChange={(event) => {
            onChange('note', event.target.value)
          }}
        />
        <p id="enrolment-note-hint" className="text-muted-foreground flex justify-between gap-2 text-xs">
          <span>{t('enrolment.public.fields.noteHint')}</span>
          <span aria-hidden="true">
            {draft.note.length}/{NOTE_MAX}
          </span>
        </p>
        <FieldError field="note" errors={errors} />
      </div>
    </fieldset>
  )
}

type Problem = { kind: 'tooMany'; retryAfter: number | null } | { kind: 'network' } | { kind: 'failed' }

function SentView({ clubSlug, email }: { clubSlug: string; email: string }) {
  const t = useT()
  const [pending, setPending] = React.useState(false)
  const [outcome, setOutcome] = React.useState<UniformOutcome | { status: 'network' } | null>(null)
  const again = async () => {
    setPending(true)
    try {
      setOutcome(await resendConfirmation(clubSlug, email))
    } catch {
      setOutcome({ status: 'network' })
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="enrolment-sent-title" data-testid="enrolment-sent">
      <Alert style="light" status="success">
        <AlertTitle id="enrolment-sent-title">{t('enrolment.public.sent.title')}</AlertTitle>
        <AlertDescription>{t('enrolment.public.sent.text', { email: email.trim() })}</AlertDescription>
      </Alert>
      <p className="text-muted-foreground max-w-prose text-sm">{t('enrolment.public.sent.spam')}</p>
      <div className="flex flex-col items-start gap-2" aria-live="polite">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          data-testid="enrolment-send-again"
          onClick={() => void again()}
        >
          {pending ? t('enrolment.public.sent.sending') : t('enrolment.public.sent.again')}
        </Button>
        {outcome?.status === 'sent' ? (
          <p className="text-sm" data-testid="enrolment-sent-again">
            {t('enrolment.public.sent.againDone')}
          </p>
        ) : null}
        {outcome?.status === 'too_many' ? (
          <p className="text-destructive text-sm" role="alert" data-testid="enrolment-too-many">
            {tooManyText(t, outcome.retryAfter)}
          </p>
        ) : null}
        {outcome?.status === 'failed' || outcome?.status === 'network' ? (
          <p className="text-destructive text-sm" role="alert" data-testid="enrolment-send-again-failed">
            {t('enrolment.public.errors.failed')}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function ClosedNotice({ clubSlug, sectionSlug }: { clubSlug: string; sectionSlug: string }) {
  const t = useT()
  return (
    <PublicEnrolmentNotice
      title={t('enrolment.public.closed.title')}
      message={t('enrolment.public.closed.message')}
      testId="enrolment-closed"
    >
      <p>
        <Link href={sectionHref(clubSlug, sectionSlug)} className={LINK_CLASS} data-testid="enrolment-closed-section">
          {t('enrolment.public.closed.back')}
        </Link>
      </p>
    </PublicEnrolmentNotice>
  )
}

function Form({
  clubSlug,
  sectionSlug,
  form,
  onClosed,
  onGroupsChanged,
}: {
  clubSlug: string
  sectionSlug: string
  form: PublicFormView
  onClosed: () => void
  onGroupsChanged: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT)
  const [step, setStep] = React.useState<Step>(1)
  const [errors, setErrors] = React.useState<Errors>({})
  const [problem, setProblem] = React.useState<Problem | null>(null)
  const [pending, setPending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const moved = React.useRef(false)

  React.useEffect(() => {
    // Focus follows the step (not on the first render), so a screen reader hears the new step's heading.
    if (!moved.current) return
    headingRef.current?.focus()
  }, [step, sent])

  const goTo = (next: Step) => {
    moved.current = true
    setStep(next)
  }

  const clearError = (field: keyof Draft) => {
    const key = fieldOf(field === 'choice' ? 'groupId' : field)
    if (!key) return
    setErrors((current) => {
      if (!current[key]) return current
      return Object.fromEntries(Object.entries(current).filter(([field]) => field !== key))
    })
  }
  const onChange = (field: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    clearError(field)
  }
  const onToggle = (field: keyof Draft, value: boolean) => {
    setDraft((current) => ({ ...current, [field]: value }))
    clearError(field)
  }

  const next = () => {
    const stepErrors = pick(validate(draft, form, locale), STEP_FIELDS[step])
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    setProblem(null)
    goTo(step === 1 ? 2 : 3)
  }

  const submit = async () => {
    const all = validate(draft, form, locale)
    const first = firstStep(all)
    if (first !== null) {
      setErrors(pick(all, STEP_FIELDS[first]))
      if (first !== step) goTo(first)
      return
    }
    setProblem(null)
    setPending(true)
    try {
      const outcome = await submitApplication(clubSlug, sectionSlug, bodyOf(draft, locale))
      if (outcome.status === 'sent') {
        moved.current = true
        setSent(true)
      } else if (outcome.status === 'closed') {
        onClosed()
      } else if (outcome.status === 'invalid') {
        const refused: Errors = {}
        for (const name of outcome.fields) {
          const field = fieldOf(name)
          if (field && !refused[field]) refused[field] = field
        }
        if (outcome.code === 'birth_date_future') refused.participantBirthDate = 'birthDateFuture'
        if (outcome.code === 'age_out_of_bounds') {
          refused.participantBirthDate = draft.kind === 'adult' ? 'adultAge' : 'childAge'
        }
        if (outcome.code === 'application_group_invalid') {
          refused.groupId = 'groupInvalid'
          onGroupsChanged()
        }
        const at = firstStep(refused)
        if (at === null) {
          setProblem({ kind: 'failed' })
        } else {
          setErrors(pick(refused, STEP_FIELDS[at]))
          if (at !== step) goTo(at)
        }
      } else if (outcome.status === 'too_many') {
        setProblem({ kind: 'tooMany', retryAfter: outcome.retryAfter })
      } else {
        setProblem({ kind: 'failed' })
      }
    } catch {
      setProblem({ kind: 'network' })
    } finally {
      setPending(false)
    }
  }

  const child = draft.kind !== 'adult'
  const title = t('enrolment.public.form.title', { section: form.section.name })

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
          {title}
        </h1>
        <SentView clubSlug={clubSlug} email={draft.email} />
      </div>
    )
  }

  const birthDateValid = validBirthDate(draft.participantBirthDate)
  const stepTitle = t(`enrolment.public.step${String(step)}.title`)

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      data-testid="enrolment-apply-form"
      data-step={step}
      aria-labelledby="enrolment-form-title"
      onSubmit={(event) => {
        event.preventDefault()
        if (step === 3) void submit()
        else next()
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 id="enrolment-form-title" className="text-2xl font-semibold break-words">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm" data-testid="enrolment-step-counter">
          {t('enrolment.public.form.stepOf', { step, total: 3 })}
        </p>
      </div>

      <section
        className="flex flex-col gap-4"
        data-testid={`enrolment-step-${String(step)}`}
        aria-labelledby="enrolment-step-title"
      >
        <h2 id="enrolment-step-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          {stepTitle}
        </h2>

        {step === 1 ? (
          <>
            <fieldset className="flex flex-col gap-2" {...invalidProps('kind', errors)}>
              <legend className="mb-1 text-sm font-medium">{t('enrolment.public.fields.kind')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['child', 'adult'] as const).map((kind) => (
                  <label key={kind} htmlFor={`enrolment-kind-${kind}`} className={OPTION_CLASS}>
                    <input
                      id={`enrolment-kind-${kind}`}
                      type="radio"
                      name="kind"
                      value={kind}
                      className={CHECK_CLASS}
                      checked={draft.kind === kind}
                      data-testid={`enrolment-kind-${kind}`}
                      onChange={() => {
                        onChange('kind', kind)
                      }}
                    />
                    <span className="font-medium">{t(`enrolment.public.kind.${kind}`)}</span>
                  </label>
                ))}
              </div>
              <FieldError field="kind" errors={errors} />
            </fieldset>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                field="participantFirstName"
                label={t(child ? 'enrolment.public.fields.childFirstName' : 'enrolment.public.fields.firstName')}
                draft={draft}
                errors={errors}
                onChange={onChange}
                autoComplete={child ? 'off' : 'given-name'}
                maxLength={100}
              />
              <TextField
                field="participantLastName"
                label={t(child ? 'enrolment.public.fields.childLastName' : 'enrolment.public.fields.lastName')}
                draft={draft}
                errors={errors}
                onChange={onChange}
                autoComplete={child ? 'off' : 'family-name'}
                maxLength={100}
              />
            </div>
            <div className="flex flex-col gap-1">
              <TextField
                field="participantBirthDate"
                label={t(child ? 'enrolment.public.fields.childBirthDate' : 'enrolment.public.fields.birthDate')}
                draft={draft}
                errors={errors}
                onChange={onChange}
                type="date"
                autoComplete={child ? 'off' : 'bday'}
                max={form.today}
              />
              <p className="text-sm" aria-live="polite" data-testid="enrolment-age-hint">
                {birthDateValid && draft.participantBirthDate <= form.today
                  ? t('enrolment.public.form.ageOn', {
                      date: formatCalendarDate(form.referenceDate, locale),
                      age: ageOnReference(draft.participantBirthDate, form.referenceDate),
                    })
                  : t('enrolment.public.form.ageReference', { date: formatCalendarDate(form.referenceDate, locale) })}
              </p>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <StepGroups form={form} draft={draft} errors={errors} onChange={onChange} onToggle={onToggle} />
        ) : null}

        {step === 3 ? (
          <>
            {child ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  field="guardianFirstName"
                  label={t('enrolment.public.fields.guardianFirstName')}
                  draft={draft}
                  errors={errors}
                  onChange={onChange}
                  autoComplete="given-name"
                  maxLength={100}
                />
                <TextField
                  field="guardianLastName"
                  label={t('enrolment.public.fields.guardianLastName')}
                  draft={draft}
                  errors={errors}
                  onChange={onChange}
                  autoComplete="family-name"
                  maxLength={100}
                />
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                field="email"
                label={t('enrolment.public.fields.email')}
                draft={draft}
                errors={errors}
                onChange={onChange}
                type="email"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
              />
              <TextField
                field="phone"
                label={t('enrolment.public.fields.phone')}
                draft={draft}
                errors={errors}
                onChange={onChange}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                hint={t('enrolment.public.fields.phoneHint')}
              />
            </div>
            {child ? (
              <CheckField
                field="guardianStatement"
                label={t('enrolment.public.fields.guardianStatement')}
                draft={draft}
                errors={errors}
                onToggle={onToggle}
              />
            ) : null}
            <CheckField
              field="rulesAccepted"
              label={t('enrolment.public.consents.rules')}
              draft={draft}
              errors={errors}
              onToggle={onToggle}
            >
              {form.rulesUrl ? (
                <a
                  className={`${LINK_CLASS} ps-8 text-sm`}
                  href={form.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="enrolment-rules-link"
                >
                  {t('enrolment.public.consents.rulesLink')}
                </a>
              ) : null}
            </CheckField>
            <CheckField
              field="privacyAcknowledged"
              label={t('enrolment.public.consents.privacy')}
              draft={draft}
              errors={errors}
              onToggle={onToggle}
            >
              <div className="ps-8">
                <InformationText form={form} />
              </div>
            </CheckField>
          </>
        ) : null}
      </section>

      {/* The honeypot: hidden from people and assistive technology; a filled one is refused by the server. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="enrolment-website">{t('enrolment.public.honeypot')}</label>
        <input
          id="enrolment-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={draft.website}
          onChange={(event) => {
            onChange('website', event.target.value)
          }}
        />
      </div>

      {problem ? (
        <div className="flex flex-col items-start gap-2" role="alert" data-testid="enrolment-problem">
          <p className="text-destructive text-sm">
            {problem.kind === 'tooMany'
              ? tooManyText(t, problem.retryAfter)
              : problem.kind === 'network'
                ? t('enrolment.public.errors.network')
                : t('enrolment.public.errors.failed')}
          </p>
          {problem.kind === 'network' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              data-testid="enrolment-retry"
              onClick={() => void submit()}
            >
              {t('enrolment.public.actions.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            data-testid="enrolment-back"
            onClick={() => {
              setErrors({})
              setProblem(null)
              goTo(step === 3 ? 2 : 1)
            }}
          >
            {t('enrolment.public.actions.back')}
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button type="submit" className="min-h-11" data-testid="enrolment-next">
            {t('enrolment.public.actions.next')}
          </Button>
        ) : (
          <Button type="submit" className="min-h-11" disabled={pending} data-testid="enrolment-submit">
            {pending ? t('enrolment.public.actions.sending') : t('enrolment.public.actions.submit')}
          </Button>
        )}
      </div>
    </form>
  )
}

export function ApplyForm({ clubSlug, sectionSlug }: { clubSlug: string; sectionSlug: string }) {
  const t = useT()
  const query = usePublicForm(clubSlug, sectionSlug)
  // A submission refused with `applications_closed` closes the page even while the cached form still says open.
  const [closed, setClosed] = React.useState(false)
  const load = query.data

  if (!load && query.isFetching) return <PublicEnrolmentLoading label={t('enrolment.public.form.loading')} />
  if (!load) return <PublicEnrolmentError onRetry={() => void query.refetch()} />
  if (load.status === 'closed' || closed) {
    return (
      <PublicEnrolmentFrame club={load.status === 'ok' ? load.form.club : load.club}>
        <ClosedNotice clubSlug={clubSlug} sectionSlug={sectionSlug} />
      </PublicEnrolmentFrame>
    )
  }
  return (
    <PublicEnrolmentFrame club={load.form.club}>
      <Form
        clubSlug={clubSlug}
        sectionSlug={sectionSlug}
        form={load.form}
        onClosed={() => {
          setClosed(true)
        }}
        onGroupsChanged={() => void query.refetch()}
      />
    </PublicEnrolmentFrame>
  )
}
