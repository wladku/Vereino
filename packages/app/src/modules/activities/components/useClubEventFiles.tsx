'use client'
// The uploads and removals of a club event's poster and funder logos (club events spec REQ-T08, DD-T10; #379), shared
// by the panel's Files tab (`ClubEventFilesPanel`) and the phone event page's files block (E14-S05, #380): the file
// goes as multipart with its kind (and a logo's funder name, 2–120 characters); the server checks the bytes and its
// 422 codes are kept per kind for the host to show; a removal asks first and sends the file's lock token.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_FUNDER_LOGOS, funderNameOf } from '../lib/club-event-files'
import { errorMessage } from './client-helpers'
import type { ClubEventDetail, ClubEventFileItem } from './club-events-client'

export const CLUB_EVENT_IMAGE_TYPES = 'image/png,image/jpeg,image/webp'

export type ClubEventFileKind = ClubEventFileItem['kind']

export function useClubEventFiles(event: ClubEventDetail, onChanged: () => Promise<void>) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [problems, setProblems] = React.useState<Partial<Record<ClubEventFileKind, string>>>({})
  const [funderName, setFunderName] = React.useState('')
  const [nameTouched, setNameTouched] = React.useState(false)
  const files = event.files ?? []
  const poster = files.find((file) => file.kind === 'poster') ?? null
  const logos = files.filter((file) => file.kind === 'funder_logo')
  const base = `/api/activities/club-events/${encodeURIComponent(event.id)}/files`
  const nameValid = funderNameOf('funder_logo', funderName).valid

  const upload = async (file: File | undefined, kind: ClubEventFileKind) => {
    if (!file) return
    if (kind === 'funder_logo' && !nameValid) {
      setNameTouched(true)
      return
    }
    setUploading(file.name)
    setProblems((current) => ({ ...current, [kind]: undefined }))
    try {
      const body = new FormData()
      body.append('kind', kind)
      if (kind === 'funder_logo') body.append('funderName', funderName.trim())
      body.append('file', file)
      await apiCallOrThrow(
        base,
        { method: 'POST', body },
        { errorMessage: t('activities.clubEventFiles.errors.upload') },
      )
      flash(t('activities.clubEventFiles.flash.uploaded', { name: file.name }), 'success')
      if (kind === 'funder_logo') {
        setFunderName('')
        setNameTouched(false)
      }
    } catch (error: unknown) {
      const reason = errorMessage(error, t('activities.clubEventFiles.errors.upload'))
      setProblems((current) => ({
        ...current,
        [kind]: t('activities.clubEventFiles.errors.file', { name: file.name, reason }),
      }))
    } finally {
      setUploading(null)
      await onChanged()
    }
  }

  const remove = async (file: ClubEventFileItem) => {
    const label =
      file.kind === 'poster' ? t('activities.clubEventFiles.poster.title') : (file.funderName ?? file.fileName)
    const confirmed = await confirm({
      title: t('activities.clubEventFiles.confirm.remove', { name: label }),
      text: t('activities.clubEventFiles.confirm.text'),
      confirmText: t('activities.clubEventFiles.actions.remove'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(file.updatedAt), () =>
        apiCallOrThrow(
          `${base}/${encodeURIComponent(file.id)}`,
          { method: 'DELETE' },
          { errorMessage: t('activities.clubEventFiles.errors.remove') },
        ),
      )
      flash(t('activities.clubEventFiles.flash.removed', { name: label }), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('activities.clubEventFiles.errors.remove')), 'error')
      }
    } finally {
      await onChanged()
    }
  }

  return {
    poster,
    logos,
    uploading,
    busy: uploading !== null,
    problems,
    funderName,
    setFunderName,
    nameTouched,
    setNameTouched,
    nameValid,
    logosFull: logos.length >= MAX_FUNDER_LOGOS,
    upload,
    remove,
    ConfirmDialogElement,
  }
}
