'use client'
// The signed contract PDF on the contract form (B-07; people life-cycle spec REQ-L12; #312): one PDF up to 10 MB,
// uploaded at once (a new upload replaces the file), downloaded through the scoped route and removed after a
// confirmation. The server checks the bytes and answers 422 for another format or a larger file, shown as a flash.
// A file change moves the contract's version, so the panel asks its page to reload the record (`onChanged`).
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CONTRACT_ATTACHMENT_MAX_BYTES } from '../lib/files'
import { errorMessage } from './client-helpers'

export function ContractAttachmentPanel({
  contractId,
  hasAttachment,
  onChanged,
}: {
  contractId: string
  hasAttachment: boolean
  onChanged: () => void | Promise<void>
}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const url = `/api/club_core/contracts/${contractId}/attachment`

  const upload = async (files: File[]) => {
    const file = files.at(0)
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiCallOrThrow(
        url,
        { method: 'POST', body },
        { errorMessage: t('club_core.contracts.attachment.errors.upload') },
      )
      flash(t('club_core.contracts.attachment.flash.uploaded'), 'success')
      await onChanged()
    } catch (err: unknown) {
      flash(errorMessage(err, t('club_core.contracts.attachment.errors.upload')), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const confirmed = await confirm({
      title: t('club_core.contracts.attachment.confirm.remove'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await apiCallOrThrow(
        url,
        { method: 'DELETE' },
        { errorMessage: t('club_core.contracts.attachment.errors.remove') },
      )
      flash(t('club_core.contracts.attachment.flash.removed'), 'success')
      await onChanged()
    } catch (err: unknown) {
      flash(errorMessage(err, t('club_core.contracts.attachment.errors.remove')), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="contract-attachment-panel">
      {hasAttachment ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
          data-testid="contract-attachment-file"
        >
          <a className="font-medium underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer">
            {t('club_core.contracts.attachment.download')}
          </a>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove()}>
            {t('club_core.contracts.attachment.remove')}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('club_core.contracts.attachment.empty')}</p>
      )}
      <FileUploadArea
        accept="application/pdf"
        multiple={false}
        maxSizeBytes={CONTRACT_ATTACHMENT_MAX_BYTES}
        disabled={busy}
        heading={
          hasAttachment ? t('club_core.contracts.attachment.replace') : t('club_core.contracts.attachment.upload')
        }
        description={t('club_core.contracts.attachment.help')}
        browseLabel={t('club_core.contracts.attachment.browse')}
        onFilesSelected={(files) => void upload(files)}
      />
      {ConfirmDialogElement}
    </div>
  )
}
