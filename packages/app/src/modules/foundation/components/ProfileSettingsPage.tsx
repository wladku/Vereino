'use client'
// The profile page of the backend (`/backend/auth/profile`, `/backend/profile/change-password`) as Vereino replaces it
// (S8.5, ENG-Q-12; #737): the same form as the platform's, but a new login e-mail needs the current password and goes
// to `PUT /api/foundation/profile/email`; a new password still goes to the platform's `PUT /api/auth/profile`.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Save } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  buildPasswordSchema,
  formatPasswordRequirements,
  getPasswordPolicy,
} from '@open-mercato/shared/lib/auth/passwordPolicy'
import { planProfileChange, type ProfileFormValues } from '../lib/profile-change'

type ProfileResponse = { email?: string | null }
type ProfileUpdateResponse = { ok?: boolean; email?: string | null }

export default function ProfileSettingsPage() {
  const t = useT()
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState('')
  const [formKey, setFormKey] = React.useState(0)
  const formId = React.useId()
  const passwordPolicy = React.useMemo(() => getPasswordPolicy(), [])
  const passwordRequirements = React.useMemo(() => formatPasswordRequirements(passwordPolicy, t), [passwordPolicy, t])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { ok, result } = await apiCall<ProfileResponse>('/api/auth/profile')
      if (cancelled) return
      if (ok && typeof result?.email === 'string') setEmail(result.email)
      else setError(t('auth.profile.form.errors.load', 'Failed to load profile.'))
      setLoading(false)
    }
    void load().catch(() => {
      if (!cancelled) {
        setError(t('auth.profile.form.errors.load', 'Failed to load profile.'))
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [t])

  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'email', label: t('auth.profile.form.email', 'Email'), type: 'text', required: true },
      {
        id: 'currentPassword',
        label: t('auth.profile.form.currentPassword', 'Current password'),
        type: 'password',
        description: t('foundation.profile.currentPasswordHelp', 'Needed to change your e-mail or your password.'),
      },
      {
        id: 'password',
        label: t('auth.profile.form.password', 'New password'),
        type: 'password',
        description: passwordRequirements
          ? t('auth.password.requirements.help', 'Password requirements: {requirements}', {
              requirements: passwordRequirements,
            })
          : undefined,
      },
      {
        id: 'confirmPassword',
        label: t('auth.profile.form.confirmPassword', 'Confirm new password'),
        type: 'password',
      },
    ],
    [passwordRequirements, t],
  )

  const schema = React.useMemo(() => {
    const passwordSchema = buildPasswordSchema({
      policy: passwordPolicy,
      message: t('auth.profile.form.errors.passwordRequirements', 'Password must meet the requirements.'),
    })
    return z
      .object({
        email: z.string(),
        currentPassword: z.string().optional(),
        password: z.union([z.literal(''), passwordSchema]).optional(),
        confirmPassword: z.string().optional(),
      })
      .superRefine((values, ctx) => {
        for (const issue of planProfileChange(email, values).issues) {
          ctx.addIssue({ code: 'custom', message: t(issue.messageKey), path: [issue.path] })
        }
      })
  }, [email, passwordPolicy, t])

  const handleSubmit = React.useCallback(
    async (values: ProfileFormValues) => {
      const plan = planProfileChange(email, values)
      if (!plan.email && !plan.password) {
        throw createCrudFormError(t('auth.profile.form.errors.noChanges', 'No changes to save.'))
      }
      let savedEmail = email
      if (plan.email) {
        const result = await readApiResultOrThrow<ProfileUpdateResponse>(
          '/api/foundation/profile/email',
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: plan.email, currentPassword: plan.currentPassword }),
          },
          { errorMessage: t('auth.profile.form.errors.save', 'Failed to update profile.') },
        )
        savedEmail = typeof result.email === 'string' ? result.email : plan.email
        setEmail(savedEmail)
      }
      if (plan.password) {
        await readApiResultOrThrow<ProfileUpdateResponse>(
          '/api/auth/profile',
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: savedEmail, currentPassword: plan.currentPassword, password: plan.password }),
          },
          { errorMessage: t('auth.profile.form.errors.save', 'Failed to update profile.') },
        )
      }
      setFormKey((previous) => previous + 1)
      flash(t('auth.profile.form.success', 'Profile updated.'), 'success')
      router.refresh()
    },
    [email, router, t],
  )

  return (
    <Page>
      <PageBody>
        {loading ? (
          <LoadingMessage label={t('auth.profile.form.loading', 'Loading profile...')} />
        ) : error ? (
          <ErrorMessage label={error} />
        ) : (
          <section className="bg-background space-y-6 rounded-lg border p-6" data-testid="vereino-profile-settings">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t('auth.profile.title', 'Profile')}</h2>
                <p className="text-muted-foreground text-sm">{t('auth.profile.subtitle', 'Change password')}</p>
              </div>
              <Button type="submit" form={formId}>
                <Save className="mr-2 size-4" aria-hidden="true" />
                {t('auth.profile.form.save', 'Save changes')}
              </Button>
            </header>
            <CrudForm<ProfileFormValues>
              key={formKey}
              formId={formId}
              schema={schema}
              fields={fields}
              initialValues={{ email, currentPassword: '', password: '', confirmPassword: '' }}
              submitLabel={t('auth.profile.form.save', 'Save changes')}
              onSubmit={handleSubmit}
              embedded
              hideFooterActions
            />
          </section>
        )}
      </PageBody>
    </Page>
  )
}
