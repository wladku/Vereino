'use client'
// The logo panel of the club settings and the section edit page (club spec glossary *Logo*, UI table; REQ-028,
// TEST-040; #29): a preview of the effective logo (the section's own, else the club's, else the initial of the club
// name), an upload area (PNG, JPEG, WebP up to 2 MB — the server checks the file's bytes and answers 422 otherwise) and
// a confirmed removal. Every write sends the record's lock token; a conflict is surfaced with the shared banner.
import * as React from 'react'
import Image from 'next/image'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { LOGO_MAX_BYTES, type LogoSource } from '../lib/files'
import { errorMessage } from './client-helpers'

export type LogoPanelProps = {
  title: string
  description: string
  /** The effective logo image (staff URL), or null for the initial. */
  imageUrl: string | null
  initial: string
  source: LogoSource
  /** Whether the record has its own logo to remove. */
  removable: boolean
  updatedAt: string | null
  endpoint: string
  canEdit: boolean
  testId: string
  onChanged: () => Promise<void>
}

export function LogoPanel(props: LogoPanelProps) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)

  const send = async (init: RequestInit, success: string, failure: string) => {
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(props.updatedAt), () =>
        apiCallOrThrow(props.endpoint, init, { errorMessage: failure }),
      )
      flash(success, 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, failure), 'error')
    } finally {
      setBusy(false)
      await props.onChanged()
    }
  }

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    const file = files[0]
    const body = new FormData()
    body.append('file', file)
    await send({ method: 'POST', body }, t('club_core.logo.flash.uploaded'), t('club_core.logo.errors.upload'))
  }

  const remove = async () => {
    const confirmed = await confirm({
      title: t('club_core.logo.confirm.remove'),
      text: t('club_core.logo.confirm.removeText'),
      variant: 'destructive',
    })
    if (!confirmed) return
    await send({ method: 'DELETE' }, t('club_core.logo.flash.removed'), t('club_core.logo.errors.remove'))
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4" data-testid={props.testId}>
      <SectionHeader title={props.title} />
      <p className="text-muted-foreground max-w-prose text-sm">{props.description}</p>
      <div className="flex flex-wrap items-center gap-4">
        {props.imageUrl ? (
          <Image
            src={props.imageUrl}
            alt={t('club_core.logo.previewAlt')}
            width={96}
            height={96}
            unoptimized
            className="bg-muted size-24 rounded-md border object-contain"
            data-testid={`${props.testId}-image`}
          />
        ) : (
          <span
            role="img"
            aria-label={t('club_core.logo.initialAlt', { initial: props.initial })}
            className="bg-muted text-muted-foreground flex size-24 items-center justify-center rounded-md border text-3xl font-semibold"
            data-testid={`${props.testId}-initial`}
          >
            {props.initial}
          </span>
        )}
        <span data-testid={`${props.testId}-source`}>
          <StatusBadge variant={props.source === 'initial' ? 'neutral' : 'info'}>
            {t(`club_core.logo.source.${props.source}`)}
          </StatusBadge>
        </span>
        {props.canEdit && props.removable ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
            {t('club_core.logo.actions.remove')}
          </Button>
        ) : null}
      </div>
      {props.canEdit ? (
        <FileUploadArea
          accept="image/png,image/jpeg,image/webp"
          multiple={false}
          maxSizeBytes={LOGO_MAX_BYTES}
          disabled={busy}
          heading={t('club_core.logo.upload.heading')}
          description={t('club_core.logo.upload.description')}
          browseLabel={t('club_core.logo.upload.browse')}
          onFilesSelected={(files) => void upload(files)}
        />
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
