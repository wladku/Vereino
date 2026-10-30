'use client'
// `/backend/activities/policies/create` and `/backend/activities/policies/[id]/edit` (club spec UI table, REQ-007;
// #32): one declaration policy — its scope (club, one group, away trips or one activity type), who declares for a minor
// with an account, the confirmation limit and what happens after it. The scope of an existing policy is fixed (the
// update body has no scope fields), so the edit form shows it as read-only text and edits the three rules.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ACTIVITY_TYPES } from '../lib/activities-rules'
import {
  DEFAULT_CONFIRM_TIMEOUT_HOURS,
  MAX_CONFIRM_TIMEOUT_HOURS,
  MINOR_DECLARATION_MODES,
  POLICY_SCOPES,
  TIMEOUT_DEFAULTS,
} from '../lib/policy'
import {
  POLICIES_HREF,
  errorMessage,
  groupOptions,
  policyFieldOfError,
  policyScopeLabel,
  tolerant,
  typeLabel,
  type PolicyRow,
  type Translate,
} from './client-helpers'

const ENTITY_ID = 'activities:attendance_policy'
const API_PATH = 'activities/attendance-policies'

type PolicyFormValues = Record<string, unknown> & { updatedAt?: string | null }

/** The three rules every policy has; the same in the create and the edit form. */
function ruleFields(t: Translate): CrudField[] {
  return [
    {
      id: 'minorDeclarationMode',
      label: t('activities.policies.fields.mode'),
      type: 'select',
      required: true,
      options: MINOR_DECLARATION_MODES.map((mode) => ({ value: mode, label: t(`activities.policies.mode.${mode}`) })),
      description: t('activities.policies.fields.mode.help'),
    },
    {
      id: 'confirmTimeoutHours',
      label: t('activities.policies.fields.timeout'),
      type: 'number',
      required: true,
      layout: 'half',
      description: t('activities.policies.fields.timeout.help'),
    },
    {
      id: 'defaultAfterTimeout',
      label: t('activities.policies.fields.afterTimeout'),
      type: 'select',
      required: true,
      layout: 'half',
      options: TIMEOUT_DEFAULTS.map((value) => ({
        value,
        label: t(`activities.policies.afterTimeout.${value}`),
      })),
      description: t('activities.policies.fields.afterTimeout.help'),
    },
  ]
}

function ruleGroup(t: Translate): CrudFormGroup {
  return {
    id: 'rules',
    title: t('activities.policies.groups.rules'),
    column: 1,
    fields: ['minorDeclarationMode', 'confirmTimeoutHours', 'defaultAfterTimeout'],
  }
}

/** The create form: the scope selector and the fields each scope needs (`visibleWhen` shows one at a time). */
function useCreateFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'scope',
        label: t('activities.policies.fields.scope'),
        type: 'select',
        required: true,
        options: POLICY_SCOPES.map((scope) => ({ value: scope, label: t(`activities.policies.scope.${scope}`) })),
        description: t('activities.policies.fields.scope.help'),
      },
      {
        id: 'groupId',
        label: t('activities.fields.group'),
        type: 'select',
        required: true,
        visibleWhen: { field: 'scope', equals: 'group' },
        loadOptions: tolerant(() => groupOptions(false)),
      },
      {
        id: 'activityType',
        label: t('activities.policies.fields.activityType'),
        type: 'select',
        required: true,
        visibleWhen: { field: 'scope', equals: 'activity_type' },
        options: ACTIVITY_TYPES.map((type) => ({ value: type, label: typeLabel(t, type) })),
      },
      ...ruleFields(t),
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'scope',
        title: t('activities.policies.groups.scope'),
        column: 1,
        fields: ['scope', 'groupId', 'activityType'],
      },
      ruleGroup(t),
    ],
    [t],
  )
  return { fields, groups }
}

/** The edit form: the fixed scope as read-only text, then the three rules. */
function useEditFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'scopeLabel',
        label: t('activities.policies.fields.scope'),
        type: 'text',
        readOnly: true,
        description: t('activities.policies.fields.scope.fixed'),
      },
      ...ruleFields(t),
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      { id: 'scope', title: t('activities.policies.groups.scope'), column: 1, fields: ['scopeLabel'] },
      ruleGroup(t),
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(t: Translate, row: PolicyRow | null): PolicyFormValues {
  return {
    scope: row?.scope ?? 'club',
    scopeLabel: row ? policyScopeLabel(t, row) : '',
    groupId: row?.groupId ?? undefined,
    activityType: row?.activityType ?? undefined,
    minorDeclarationMode: row?.minorDeclarationMode ?? 'immediate',
    confirmTimeoutHours: row?.confirmTimeoutHours ?? DEFAULT_CONFIRM_TIMEOUT_HOURS,
    defaultAfterTimeout: row?.defaultAfterTimeout ?? 'declared',
    updatedAt: row?.updatedAt ?? null,
  }
}

/** The whole hours of the limit, or null when the value is not an integer from 1 to the maximum. */
function timeoutHours(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CONFIRM_TIMEOUT_HOURS) return null
  return parsed
}

type RuleBody = { minorDeclarationMode: string; confirmTimeoutHours: number; defaultAfterTimeout: string }

/** A select value as the API takes it; '' when nothing is chosen (the required check runs first). */
const chosen = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The three rules of the body; a limit outside 1–336 hours is refused on its field before the request. */
function ruleBody(values: PolicyFormValues, t: Translate): RuleBody {
  const hours = timeoutHours(values.confirmTimeoutHours)
  if (hours === null) {
    const message = t('activities.policies.errors.timeout')
    throw createCrudFormError(t('activities.form.errors.invalid'), { confirmTimeoutHours: message })
  }
  return {
    minorDeclarationMode: chosen(values.minorDeclarationMode),
    confirmTimeoutHours: hours,
    defaultAfterTimeout: chosen(values.defaultAfterTimeout),
  }
}

/** The create body: only the scope field the chosen scope needs is sent (422 `attendance_policy_scope_invalid`). */
function createBody(values: PolicyFormValues, t: Translate) {
  const scope = chosen(values.scope)
  return {
    scope,
    ...(scope === 'group' ? { groupId: chosen(values.groupId) || undefined } : {}),
    ...(scope === 'activity_type' ? { activityType: chosen(values.activityType) || undefined } : {}),
    ...ruleBody(values, t),
  }
}

/**
 * Turns a refused save into what the form shows: a 409 duplicate and the coded 422s go to their field. Other errors
 * (the optimistic-lock 409 among them) are passed on unchanged for the form's own handling.
 */
function saveError(error: unknown, t: Translate): unknown {
  const field = policyFieldOfError(error)
  if (!field) return error
  const message = errorMessage(error, t('activities.form.errors.invalid'))
  return createCrudFormError(message, { [field]: message })
}

export function PolicyCreateForm() {
  const t = useT()
  const { fields, groups } = useCreateFields(t)
  const initialValues = React.useMemo(() => toFormValues(t, null), [t])
  return (
    <CrudForm<PolicyFormValues>
      title={t('activities.policies.create.title')}
      titleHeadingLevel={1}
      backHref={POLICIES_HREF}
      cancelHref={POLICIES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.create')}
      successRedirect={withFlash(POLICIES_HREF, t('activities.policies.flash.created'), 'success')}
      onSubmit={async (values) => {
        const body = createBody(values, t)
        try {
          await createCrud(API_PATH, body)
        } catch (error: unknown) {
          throw saveError(error, t)
        }
      }}
    />
  )
}

export function PolicyEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useEditFields(t)
  const query = useQuery({
    queryKey: ['activities-policies-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<PolicyRow>(API_PATH, { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const initialValues = React.useMemo(() => ({ ...toFormValues(t, row), id }), [t, row, id])

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('activities.policies.errors.notFound')}
        backHref={POLICIES_HREF}
        backLabel={t('activities.policies.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('activities.policies.errors.loadOne'))} />

  return (
    <CrudForm<PolicyFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('activities.policies.edit.title')}
      titleHeadingLevel={1}
      backHref={POLICIES_HREF}
      cancelHref={POLICIES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('activities.policies.loading')}
      initialValues={initialValues}
      submitLabel={t('activities.common.save')}
      successRedirect={withFlash(POLICIES_HREF, t('activities.policies.flash.saved'), 'success')}
      deleteRedirect={withFlash(POLICIES_HREF, t('activities.policies.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        const body = ruleBody(values, t)
        try {
          await updateCrud(API_PATH, { id, ...body })
        } catch (error: unknown) {
          throw saveError(error, t)
        }
      }}
      onDelete={async () => {
        await deleteCrud(API_PATH, id)
      }}
    />
  )
}
