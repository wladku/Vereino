'use client'
// `/club/profile/password` (#876; README M-10): the member changes their own password on the phone, in the member
// layout with its bottom navigation, instead of on the panel's `/backend/profile/change-password`. Three fields —
// current password, new password, repeat — with bound labels (lesson `platform-crudform-labels-axe-baseline`), the
// server's password policy as the hint and the client check (`getPasswordPolicy`, filled by `PasswordPolicyBridge`,
// #779), and the save through the platform's `PUT /api/auth/profile`, where the Vereino password check runs. A wrong
// current password, a password that fails the policy and a repeat that differs each show under their field and in the
// error summary (R04.1–R04.3); the focus moves to the first field to fix. After a save the member returns to
// `/club/profile`, which says the password was changed. 375 px: one column, the save bar sticks above the bottom
// navigation; targets at least 44 px.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  buildPasswordSchema,
  formatPasswordRequirements,
  getPasswordPolicy,
} from '@open-mercato/shared/lib/auth/passwordPolicy'
import {
  ErrorSummary,
  FieldErrorMessage,
  fieldProblemProps,
  focusField,
  focusFirstProblem,
  type FieldProblem,
} from '@vereino/ui'
import {
  PASSWORD_CHANGED_PARAM,
  PASSWORD_CHANGED_VALUE,
  passwordChangeAnswerProblem,
  passwordFormProblems,
  type PasswordChangeField,
  type PasswordChangeProblem,
  type PasswordChangeValues,
} from '../../lib/password-change'
import { ClubFrame } from './ClubFrame'
import { CLUB_PROFILE_HREF } from './member-client'

const PROFILE_API = '/api/auth/profile'

const fieldId = (name: string) => `club-password-${name}`

const FIELD_IDS: Record<PasswordChangeField, string> = {
  currentPassword: fieldId('current'),
  password: fieldId('new'),
  confirmPassword: fieldId('repeat'),
}

const HINT_ID = 'club-password-new-hint'

const EMPTY: PasswordChangeValues = { currentPassword: '', password: '', confirmPassword: '' }

export function ClubPasswordPage() {
  return <ClubFrame skeleton="fields">{() => <PasswordForm />}</ClubFrame>
}

function PasswordForm() {
  const t = useT()
  const router = useRouter()
  const policy = React.useMemo(() => getPasswordPolicy(), [])
  const requirements = React.useMemo(() => formatPasswordRequirements(policy, t), [policy, t])
  const passwordSchema = React.useMemo(() => buildPasswordSchema({ policy }), [policy])
  const [values, setValues] = React.useState<PasswordChangeValues>(EMPTY)
  const [busy, setBusy] = React.useState(false)
  // After the first send the summary follows the typing, so a fixed field drops out of it at once.
  const [attempted, setAttempted] = React.useState(false)
  const [serverProblem, setServerProblem] = React.useState<PasswordChangeProblem | null>(null)
  // The field a refused save points at gets the focus once the form is enabled again (a disabled input takes none).
  const focusAfterSave = React.useRef<PasswordChangeField | null>(null)
  React.useEffect(() => {
    if (busy || !focusAfterSave.current) return
    focusField(FIELD_IDS[focusAfterSave.current])
    focusAfterSave.current = null
  }, [busy, serverProblem])

  const toFieldProblem = (entry: PasswordChangeProblem): FieldProblem | null =>
    entry.field ? { fieldId: FIELD_IDS[entry.field], message: entry.message ?? t(entry.messageKey) } : null
  const meetsPolicy = (password: string) => passwordSchema.safeParse(password).success
  const found = passwordFormProblems(values, meetsPolicy)
  const local = attempted ? found : []
  const problems: FieldProblem[] = [
    ...local,
    ...(serverProblem && !local.some((entry) => entry.field === serverProblem.field) ? [serverProblem] : []),
  ]
    .sort((a, b) => order(a.field) - order(b.field))
    .map(toFieldProblem)
    .filter((entry): entry is FieldProblem => entry !== null)
  const generalProblem = serverProblem && !serverProblem.field ? t(serverProblem.messageKey) : null
  const messageOf = (field: PasswordChangeField) =>
    problems.find((entry) => entry.fieldId === FIELD_IDS[field])?.message ?? null

  const change = (field: PasswordChangeField) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setValues((current) => ({ ...current, [field]: next }))
    if (serverProblem?.field === field) setServerProblem(null)
  }

  const submit = async () => {
    setServerProblem(null)
    if (found.length > 0) {
      setAttempted(true)
      focusFirstProblem(found.map(toFieldProblem).filter((entry): entry is FieldProblem => entry !== null))
      return
    }
    setBusy(true)
    try {
      const call = await apiCall<unknown>(PROFILE_API, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: values.currentPassword, password: values.password }),
      })
      if (call.ok) {
        router.push(`${CLUB_PROFILE_HREF}?${PASSWORD_CHANGED_PARAM}=${PASSWORD_CHANGED_VALUE}`)
        return
      }
      const answer = passwordChangeAnswerProblem(call.status, call.result)
      focusAfterSave.current = answer.field
      setServerProblem(answer)
    } catch {
      setServerProblem(passwordChangeAnswerProblem(0, null))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={CLUB_PROFILE_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
          {t('people.club.password.back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('people.club.password.title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('people.club.password.lead')}</p>
      </div>
      <form
        className="flex flex-col gap-4 pb-24"
        data-testid="club-password-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <ErrorSummary
          title={t('people.club.password.errors.summary')}
          problems={problems}
          data-testid="club-password-problems"
        />
        <div className="bg-card flex flex-col gap-4 rounded-lg border p-4">
          <PasswordField
            field="currentPassword"
            label={t('people.club.password.current')}
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={change('currentPassword')}
            busy={busy}
            problems={problems}
            message={messageOf('currentPassword')}
          />
          <PasswordField
            field="password"
            label={t('people.club.password.new')}
            autoComplete="new-password"
            value={values.password}
            onChange={change('password')}
            busy={busy}
            problems={problems}
            message={messageOf('password')}
            hint={
              requirements
                ? t('people.club.password.requirements', { requirements })
                : t('people.club.password.requirementsNone')
            }
          />
          <PasswordField
            field="confirmPassword"
            label={t('people.club.password.repeat')}
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={change('confirmPassword')}
            busy={busy}
            problems={problems}
            message={messageOf('confirmPassword')}
          />
        </div>
        {generalProblem ? (
          <Alert style="light" status="error" data-testid="club-password-problem">
            <p>{generalProblem}</p>
          </Alert>
        ) : null}
        <div className="bg-background sticky bottom-16 z-10 -mx-4 border-t px-4 py-3 sm:bottom-0">
          <Button type="submit" className="min-h-11 w-full" disabled={busy} data-testid="club-password-save">
            {t('people.club.password.save')}
          </Button>
        </div>
      </form>
    </div>
  )
}

const FIELD_ORDER: readonly (PasswordChangeField | null)[] = ['currentPassword', 'password', 'confirmPassword', null]

function order(field: PasswordChangeField | null): number {
  return FIELD_ORDER.indexOf(field)
}

function PasswordField({
  field,
  label,
  autoComplete,
  value,
  onChange,
  busy,
  problems,
  message,
  hint,
}: {
  field: PasswordChangeField
  label: string
  autoComplete: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  busy: boolean
  problems: readonly FieldProblem[]
  message: string | null
  hint?: string
}) {
  const id = FIELD_IDS[field]
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field}
        type="password"
        autoComplete={autoComplete}
        className="min-h-11"
        value={value}
        disabled={busy}
        onChange={onChange}
        {...fieldProblemProps(problems, id, hint ? HINT_ID : undefined)}
      />
      {hint ? (
        <p id={HINT_ID} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      <FieldErrorMessage fieldId={id} message={message} data-testid={`${id}-error`} />
    </div>
  )
}
