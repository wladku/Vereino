'use client'
// The files of the place form's "Regulations and photos" group (UX parity spec, REQ-U03, J-U03; #86): the one
// regulations PDF (a new upload replaces it) and up to 10 photos, each uploaded at once and removed after a
// confirmation. The server checks the bytes (PNG, JPEG or WebP up to 5 MB for a photo; a PDF up to 10 MB) and answers
// 422 per file, which is shown for that file. The files stay private: the links use the authenticated attachment routes.
import * as React from 'react'
import Image from 'next/image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PLACE_PHOTOS_MAX, PLACE_PHOTO_MAX_BYTES, PLACE_REGULATIONS_MAX_BYTES, type PlaceFileKind } from '../lib/files'
import { errorMessage } from './client-helpers'

type PlaceFileItem = {
  id: string
  kind: PlaceFileKind
  fileName: string
  size: number
  url: string
  thumbnailUrl: string | null
}

export function PlaceFilesPanel({ placeId }: { placeId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const base = `/api/club_core/places/${placeId}/files`
  const queryKey = ['club_core-place-files', placeId]
  const query = useQuery({
    queryKey,
    queryFn: () => readApiResultOrThrow<{ items: PlaceFileItem[] }>(base),
  })
  const items = query.data?.items ?? []
  const regulations = items.find((item) => item.kind === 'regulations') ?? null
  const photos = items.filter((item) => item.kind === 'photo')

  const upload = async (files: File[], kind: PlaceFileKind) => {
    if (files.length === 0) return
    setBusy(true)
    try {
      for (const file of files) {
        const body = new FormData()
        body.append('kind', kind)
        body.append('file', file)
        try {
          await apiCallOrThrow(
            base,
            { method: 'POST', body },
            { errorMessage: t('club_core.placeFiles.errors.upload') },
          )
          flash(t('club_core.placeFiles.flash.uploaded', { name: file.name }), 'success')
        } catch (err: unknown) {
          flash(
            t('club_core.placeFiles.errors.uploadFile', {
              name: file.name,
              reason: errorMessage(err, t('club_core.placeFiles.errors.upload')),
            }),
            'error',
          )
        }
      }
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  const remove = async (item: PlaceFileItem) => {
    const confirmed = await confirm({
      title:
        item.kind === 'photo'
          ? t('club_core.placeFiles.confirm.deletePhoto')
          : t('club_core.placeFiles.confirm.deleteRegulations'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await apiCallOrThrow(
        `${base}/${item.id}`,
        { method: 'DELETE' },
        { errorMessage: t('club_core.placeFiles.errors.delete') },
      )
      flash(t('club_core.placeFiles.flash.deleted'), 'success')
    } catch (err: unknown) {
      flash(errorMessage(err, t('club_core.placeFiles.errors.delete')), 'error')
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  if (!query.data && query.isFetching) return <LoadingMessage label={t('club_core.placeFiles.loading')} />
  if (!query.data) return <ErrorMessage label={t('club_core.placeFiles.errors.load')} />

  const photosFull = photos.length >= PLACE_PHOTOS_MAX

  return (
    <div className="flex flex-col gap-6" data-testid="place-files-panel">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('club_core.placeFiles.regulations.title')}</h3>
        {regulations ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            data-testid="place-regulations-file"
          >
            <a
              className="font-medium underline underline-offset-4"
              href={regulations.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {regulations.fileName}
            </a>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove(regulations)}>
              {t('club_core.placeFiles.actions.remove')}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('club_core.placeFiles.regulations.empty')}</p>
        )}
        <FileUploadArea
          accept="application/pdf"
          multiple={false}
          maxSizeBytes={PLACE_REGULATIONS_MAX_BYTES}
          disabled={busy}
          heading={
            regulations ? t('club_core.placeFiles.regulations.replace') : t('club_core.placeFiles.regulations.upload')
          }
          description={t('club_core.placeFiles.regulations.help')}
          browseLabel={t('club_core.placeFiles.regulations.browse')}
          onFilesSelected={(files) => void upload(files, 'regulations')}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {t('club_core.placeFiles.photos.title', {
            count: String(photos.length),
            max: String(PLACE_PHOTOS_MAX),
          })}
        </h3>
        {photos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('club_core.placeFiles.photos.empty')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="place-photos-list">
            {photos.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2 rounded-md border p-2">
                <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                  <Image
                    src={photo.thumbnailUrl ?? photo.url}
                    alt={photo.fileName}
                    width={160}
                    height={160}
                    unoptimized
                    className="bg-muted aspect-square w-full rounded object-contain"
                  />
                </a>
                <span className="text-muted-foreground truncate text-xs" title={photo.fileName}>
                  {photo.fileName}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={t('club_core.placeFiles.actions.removePhoto', { name: photo.fileName })}
                  onClick={() => void remove(photo)}
                >
                  {t('club_core.placeFiles.actions.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {photosFull ? (
          <p className="text-muted-foreground text-sm">{t('club_core.placeFiles.photos.full')}</p>
        ) : (
          <FileUploadArea
            accept="image/png,image/jpeg,image/webp"
            multiple
            maxSizeBytes={PLACE_PHOTO_MAX_BYTES}
            disabled={busy}
            heading={t('club_core.placeFiles.photos.upload')}
            description={t('club_core.placeFiles.photos.help')}
            browseLabel={t('club_core.placeFiles.photos.browse')}
            onFilesSelected={(files) => void upload(files, 'photo')}
          />
        )}
      </div>
      {ConfirmDialogElement}
    </div>
  )
}
