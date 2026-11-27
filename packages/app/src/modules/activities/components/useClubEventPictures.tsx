'use client'
// The picture actions of a club event (event photos spec REQ-I01–REQ-I04, J-I02; #872), shared by the phone Pictures
// block and the panel's Files tab: several files upload one by one, each with its own progress line and error (the
// others go on); a new picture is a photo described "{event} — photo {n}" until staff write a description. Every edit
// of a picture sends its lock token and a stale one shows the shared conflict message; a delete asks first and is final.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_PICTURES, PICTURE_DESCRIPTION_MAX } from '../lib/club-event-files'
import { errorMessage } from './client-helpers'
import type { ClubEventDetail, ClubEventPictureItem, ClubEventPictureState } from './club-events-client'

export type PictureUpload = {
  key: string
  name: string
  status: 'waiting' | 'uploading' | 'done' | 'error'
  error?: string
}

/** The tone of each picture state (a status variant, never colour alone: the tag carries the word). */
export const PICTURE_STATE_TONES: Record<ClubEventPictureState, 'neutral' | 'warning' | 'info' | 'success'> = {
  draft: 'neutral',
  unconfirmed: 'warning',
  waiting_for_consent: 'warning',
  event_not_public: 'info',
  public: 'success',
}

export function useClubEventPictures(event: ClubEventDetail, onChanged: () => Promise<void>) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [uploads, setUploads] = React.useState<PictureUpload[]>([])
  const [working, setWorking] = React.useState(false)
  const pictures = React.useMemo(
    () => [...(event.pictures ?? [])].sort((a, b) => a.position - b.position),
    [event.pictures],
  )
  const base = `/api/activities/club-events/${encodeURIComponent(event.id)}/files`
  const uploading = uploads.some((entry) => entry.status === 'uploading' || entry.status === 'waiting')

  const setUpload = (key: string, patch: Partial<PictureUpload>) => {
    setUploads((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)))
  }

  const uploadMany = async (files: readonly File[]) => {
    if (files.length === 0) return
    const stamp = Date.now()
    const queue = files.map((file, index) => ({ key: `${String(stamp)}-${String(index)}`, file }))
    setUploads(queue.map(({ key, file }) => ({ key, name: file.name, status: 'waiting' })))
    let next = pictures.length
    for (const { key, file } of queue) {
      next += 1
      setUpload(key, { status: 'uploading' })
      try {
        const body = new FormData()
        body.append('kind', 'photo')
        body.append(
          'description',
          t('activities.clubEvents.pictures.defaultDescription', { event: event.name ?? '', n: next }).slice(
            0,
            PICTURE_DESCRIPTION_MAX,
          ),
        )
        body.append('file', file)
        await apiCallOrThrow(
          base,
          { method: 'POST', body },
          { errorMessage: t('activities.clubEvents.pictures.errors.upload') },
        )
        setUpload(key, { status: 'done' })
      } catch (error: unknown) {
        next -= 1
        setUpload(key, {
          status: 'error',
          error: errorMessage(error, t('activities.clubEvents.pictures.errors.upload')),
        })
      }
    }
    await onChanged()
  }

  /** Runs one picture command with the picture's lock token; a stale token shows the conflict message. */
  const run = async (
    picture: ClubEventPictureItem,
    path: string,
    method: 'POST' | 'PUT',
    body: Record<string, unknown> | null,
    success: string,
  ): Promise<boolean> => {
    setWorking(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(picture.updatedAt), () =>
        apiCallOrThrow(
          `${base}/${encodeURIComponent(picture.id)}${path}`,
          {
            method,
            ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
          },
          { errorMessage: t('activities.clubEvents.pictures.errors.save') },
        ),
      )
      flash(success, 'success')
      return true
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('activities.clubEvents.pictures.errors.save')), 'error')
      }
      return false
    } finally {
      setWorking(false)
      await onChanged()
    }
  }

  const update = (picture: ClubEventPictureItem, patch: { description?: string; kind?: 'photo' | 'graphic' }) =>
    run(picture, '', 'PUT', patch, t('activities.clubEvents.pictures.flash.saved'))

  const move = (picture: ClubEventPictureItem, delta: -1 | 1) => {
    const index = pictures.findIndex((entry) => entry.id === picture.id)
    return run(
      picture,
      '',
      'PUT',
      { position: Math.max(0, index + delta) },
      t('activities.clubEvents.pictures.flash.moved'),
    )
  }

  const setPeople = (picture: ClubEventPictureItem, personIds: string[], confirmed: boolean) =>
    run(picture, '/people', 'PUT', { personIds, confirmed }, t('activities.clubEvents.pictures.flash.people'))

  const publish = (picture: ClubEventPictureItem) =>
    run(picture, '/publish', 'POST', null, t('activities.clubEvents.pictures.flash.published'))

  const unpublish = (picture: ClubEventPictureItem) =>
    run(picture, '/unpublish', 'POST', null, t('activities.clubEvents.pictures.flash.unpublished'))

  const publishAll = async () => {
    setWorking(true)
    try {
      const { result } = await apiCallOrThrow<{ publishedIds: string[]; skippedIds: string[] }>(
        `${base}/publish-all`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { errorMessage: t('activities.clubEvents.pictures.errors.save') },
      )
      flash(
        t('activities.clubEvents.pictures.flash.publishedAll', {
          published: result?.publishedIds.length ?? 0,
          skipped: result?.skippedIds.length ?? 0,
        }),
        'success',
      )
    } catch (error: unknown) {
      flash(errorMessage(error, t('activities.clubEvents.pictures.errors.save')), 'error')
    } finally {
      setWorking(false)
      await onChanged()
    }
  }

  const remove = async (picture: ClubEventPictureItem) => {
    const confirmed = await confirm({
      title: t('activities.clubEvents.pictures.confirm.remove', { name: picture.description }),
      text: t('activities.clubEvents.pictures.confirm.removeText'),
      confirmText: t('activities.clubEvents.pictures.actions.remove'),
      variant: 'destructive',
    })
    if (!confirmed) return false
    setWorking(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(picture.updatedAt), () =>
        apiCallOrThrow(
          `${base}/${encodeURIComponent(picture.id)}`,
          { method: 'DELETE' },
          { errorMessage: t('activities.clubEvents.pictures.errors.remove') },
        ),
      )
      flash(t('activities.clubEvents.pictures.flash.removed'), 'success')
      return true
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('activities.clubEvents.pictures.errors.remove')), 'error')
      }
      return false
    } finally {
      setWorking(false)
      await onChanged()
    }
  }

  return {
    pictures,
    uploads,
    uploading,
    busy: uploading || working,
    full: pictures.length >= MAX_PICTURES,
    hasDrafts: pictures.some((picture) => picture.state === 'draft'),
    uploadMany,
    update,
    move,
    setPeople,
    publish,
    unpublish,
    publishAll,
    remove,
    ConfirmDialogElement,
  }
}

export type ClubEventPicturesApi = ReturnType<typeof useClubEventPictures>
