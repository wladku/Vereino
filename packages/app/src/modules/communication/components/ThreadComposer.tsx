'use client'
// `/backend/communication/threads/create` — the composer (foundation III *UI and Interaction Contracts*; REQ-M05,
// REQ-M06; J-M01 step 1): `AudiencePicker` (P-32) offers only the kinds and targets the author's grants allow
// (`GET /api/communication/audience/targets`) and shows the live recipient counts
// (`POST /api/communication/audience/preview`); the subject and the message are club text, shown in a preview as the
// recipients will read them. Posting answers 403 for an audience outside the author's grants and 422 for an audience
// kind the deployment cannot reach; after posting, the thread opens. The member inbox (M-06, E06-S20) embeds the same
// composer in its "New announcement" dialog with its own kinds and its own landing.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { AudienceCounts, AudienceKind } from '@vereino/core'
import { AudiencePicker, type AudiencePickerValue, type AudienceTarget } from '@vereino/ui'
import { THREADS_HREF, errorMessage, errorStatus, threadHref, type Translate } from './client-helpers'

type ComposerValues = Record<string, unknown> & {
  audience?: AudiencePickerValue
  subject?: string
  body?: string
}

type TargetsResponse = { kinds: AudienceKind[]; items: Array<{ id: string; label: string; hint: string | null }> }

async function loadTargets(kind: AudienceKind, query: string): Promise<AudienceTarget[]> {
  const params = new URLSearchParams({ kind })
  if (query.trim()) params.set('q', query.trim())
  const call = await apiCallOrThrow<TargetsResponse>(`/api/communication/audience/targets?${params.toString()}`)
  return (call.result?.items ?? []).map((item) => ({ id: item.id, label: item.label, hint: item.hint }))
}

async function previewAudience(spec: { kind: AudienceKind; ids: string[] }): Promise<AudienceCounts> {
  const call = await apiCallOrThrow<AudienceCounts>('/api/communication/audience/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audience: spec.kind === 'club' ? { kind: 'club' } : spec }),
  })
  return call.result as AudienceCounts
}

function pickerLabels(t: Translate) {
  return {
    kind: t('communication.audience.kind'),
    kindPlaceholder: t('communication.audience.kindPlaceholder'),
    target: t('communication.audience.target'),
    targetSearch: t('communication.audience.targetSearch'),
    targetPlaceholder: t('communication.audience.targetPlaceholder'),
    noTargets: t('communication.audience.noTargets'),
    loadingTargets: t('communication.audience.loadingTargets'),
    targetsError: t('communication.audience.targetsError'),
    previewLoading: t('communication.audience.previewLoading'),
    previewError: t('communication.audience.previewError'),
    previewEmpty: t('communication.audience.previewEmpty'),
    retry: t('communication.actions.retry'),
  }
}

function isCompleteAudience(value: AudiencePickerValue | undefined): value is AudiencePickerValue {
  return Boolean(value?.kind) && (value?.kind === 'club' || (value?.ids.length ?? 0) > 0)
}

/** What the author posted: the new thread and how many people it reaches. */
export type PostedThread = { threadId: string | null; recipientCount: number }

export type ThreadComposerProps = {
  /** Inside a dialog (the member inbox): no page title and no back link; the dialog closes it. */
  embedded?: boolean
  /** Narrows the kinds the author's grants allow (the member composer offers sections, groups and sessions). */
  selectKinds?: (allowed: AudienceKind[]) => AudienceKind[]
  /** Replaces the backend landing (a flash and the backend thread page). */
  onPosted?: (posted: PostedThread) => void
}

export function ThreadComposer({ embedded = false, selectKinds, onPosted }: ThreadComposerProps = {}) {
  const t = useT()
  const router = useRouter()
  const kindsQuery = useQuery({
    queryKey: ['communication-audience-kinds'],
    queryFn: async () => {
      const call = await apiCallOrThrow<TargetsResponse>('/api/communication/audience/targets')
      return call.result?.kinds ?? []
    },
  })
  const kinds = React.useMemo(() => {
    const allowed = kindsQuery.data ?? []
    return (selectKinds ? selectKinds(allowed) : allowed).map((kind) => ({
      kind,
      label: t(`communication.audience.kinds.${kind}`),
    }))
  }, [kindsQuery.data, selectKinds, t])
  const labels = React.useMemo(() => pickerLabels(t), [t])
  const formatCounts = React.useCallback(
    (counts: AudienceCounts) =>
      t('communication.audience.counts', {
        recipients: String(counts.recipients),
        withoutEmail: String(counts.withoutEmail),
        unreachable: String(counts.unreachable),
      }),
    [t],
  )

  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'audience',
        label: t('communication.audience.kind'),
        type: 'custom',
        required: true,
        rendersOwnError: true,
        component: ({ id, value, setValue, disabled, error }) => (
          <AudiencePicker
            id={id}
            value={(value as AudiencePickerValue | undefined) ?? { kind: null, ids: [] }}
            onChange={setValue}
            kinds={kinds}
            loadTargets={loadTargets}
            preview={previewAudience}
            formatCounts={formatCounts}
            labels={labels}
            disabled={disabled}
            error={error ?? null}
          />
        ),
      },
      { id: 'subject', label: t('communication.threads.create.subject'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'body',
        label: t('communication.threads.create.body'),
        type: 'textarea',
        required: true,
        maxLength: 10000,
        description: t('communication.threads.create.bodyHelp'),
      },
      {
        id: 'preview',
        label: t('communication.threads.create.preview'),
        type: 'custom',
        component: ({ values }) => {
          const subject = typeof values?.subject === 'string' ? values.subject.trim() : ''
          const body = typeof values?.body === 'string' ? values.body.trim() : ''
          return (
            <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-3" data-testid="composer-preview">
              {subject || body ? (
                <>
                  <p className="font-semibold break-words">{subject}</p>
                  <p className="break-words whitespace-pre-line">{body}</p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">{t('communication.threads.create.previewEmpty')}</p>
              )}
            </div>
          )
        },
      },
    ],
    [t, kinds, labels, formatCounts],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      { id: 'recipients', title: t('communication.threads.create.groups.recipients'), column: 1, fields: ['audience'] },
      {
        id: 'message',
        title: t('communication.threads.create.groups.message'),
        column: 1,
        fields: ['subject', 'body', 'preview'],
      },
    ],
    [t],
  )
  const initialValues = React.useMemo<ComposerValues>(
    () => ({ audience: { kind: null, ids: [] }, subject: '', body: '' }),
    [],
  )

  return (
    <CrudForm<ComposerValues>
      {...(embedded
        ? { embedded: true }
        : {
            title: t('communication.threads.create.title'),
            titleHeadingLevel: 1 as const,
            backHref: THREADS_HREF,
            cancelHref: THREADS_HREF,
          })}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('communication.threads.create.submit')}
      onSubmit={async (values) => {
        const audience = values.audience
        if (!isCompleteAudience(audience)) {
          const message = t('communication.threads.create.errors.recipients')
          throw createCrudFormError(message, { audience: message })
        }
        try {
          const call = await apiCallOrThrow<{ threadId?: string; recipientCount?: number }>(
            '/api/communication/threads',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                audience: audience.kind === 'club' ? { kind: 'club' } : { kind: audience.kind, ids: audience.ids },
                subject: typeof values.subject === 'string' ? values.subject.trim() : '',
                body: typeof values.body === 'string' ? values.body.trim() : '',
              }),
            },
            { errorMessage: t('communication.threads.create.errors.create') },
          )
          if (onPosted) {
            onPosted({ threadId: call.result?.threadId ?? null, recipientCount: call.result?.recipientCount ?? 0 })
            return
          }
          flash(t('communication.threads.create.flash'), 'success')
          router.push(call.result?.threadId ? threadHref(call.result.threadId) : THREADS_HREF)
        } catch (error: unknown) {
          const status = errorStatus(error)
          if (status === 403) {
            const message = t('communication.threads.create.errors.denied')
            throw createCrudFormError(message, { audience: message })
          }
          if (status === 422) {
            const message = errorMessage(error, t('communication.threads.create.errors.create'))
            throw createCrudFormError(message, { audience: message })
          }
          throw error
        }
      }}
    />
  )
}
