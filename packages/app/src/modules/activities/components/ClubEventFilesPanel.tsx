'use client'
// The Files tab of the club event record (club events spec B-T3, REQ-T08, DD-T10, J-T02 step 2; #379): the poster with
// a preview and **Replace**, and the funder logos with their names and **Remove**, in upload order. A logo is uploaded
// with the funder's name (2–120 characters, the image's alternative text). The server checks the bytes — PNG, JPEG or
// WebP; a poster up to 5 MB, a logo up to 2 MB, at most 12 logos — and its 422 codes are shown beside the upload. While
// a file uploads, a status names it. Removing asks first and sends the file's lock token; the removal is undoable. A
// reader who does not manage the event, or a cancelled event, sees the files without the actions.
import * as React from 'react'
import Image from 'next/image'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  FUNDER_LOGO_MAX_BYTES,
  FUNDER_NAME_MAX,
  FUNDER_NAME_MIN,
  MAX_FUNDER_LOGOS,
  POSTER_MAX_BYTES,
  funderNameOf,
} from '../lib/club-event-files'
import { errorMessage } from './client-helpers'
import type { ClubEventDetail, ClubEventFileItem } from './club-events-client'

const IMAGE_TYPES = 'image/png,image/jpeg,image/webp'

type Kind = ClubEventFileItem['kind']

export function ClubEventFilesPanel({
  event,
  editable,
  onChanged,
}: {
  event: ClubEventDetail
  editable: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [uploading, setUploading] = React.useState<string | null>(null)
  const [problems, setProblems] = React.useState<Partial<Record<Kind, string>>>({})
  const [funderName, setFunderName] = React.useState('')
  const [nameTouched, setNameTouched] = React.useState(false)
  const files = event.files ?? []
  const poster = files.find((file) => file.kind === 'poster') ?? null
  const logos = files.filter((file) => file.kind === 'funder_logo')
  const base = `/api/activities/club-events/${encodeURIComponent(event.id)}/files`
  const busy = uploading !== null
  const nameValid = funderNameOf('funder_logo', funderName).valid
  const logosFull = logos.length >= MAX_FUNDER_LOGOS

  const upload = async (file: File | undefined, kind: Kind) => {
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

  const problem = (kind: Kind) =>
    problems[kind] ? (
      <p role="alert" className="text-status-error-text text-sm" data-testid={`club-event-${kind}-error`}>
        {problems[kind]}
      </p>
    ) : null

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="club-event-files">
      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {uploading ? (
          <span
            className="text-muted-foreground inline-flex items-center gap-2"
            data-testid="club-event-file-uploading"
          >
            <Spinner size="sm" />
            {t('activities.clubEventFiles.uploading', { name: uploading })}
          </span>
        ) : null}
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="club-event-poster-heading">
        <h2 id="club-event-poster-heading" className="text-base font-semibold">
          {t('activities.clubEventFiles.poster.title')}
        </h2>
        {poster ? (
          <figure className="flex flex-col gap-2" data-testid="club-event-poster">
            <a href={poster.url} target="_blank" rel="noopener noreferrer" className="block w-fit">
              <Image
                src={poster.url}
                alt={t('activities.clubEventFiles.poster.alt', { name: event.name ?? '' })}
                width={240}
                height={340}
                unoptimized
                className="bg-muted h-auto max-h-96 w-60 rounded-md border object-contain"
              />
            </a>
            <figcaption className="text-muted-foreground text-xs break-all">{poster.fileName}</figcaption>
          </figure>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="club-event-poster-empty">
            {t('activities.clubEventFiles.poster.empty')}
          </p>
        )}
        {editable ? (
          <>
            <FileUploadArea
              data-testid="club-event-poster-upload"
              accept={IMAGE_TYPES}
              multiple={false}
              maxSizeBytes={POSTER_MAX_BYTES}
              disabled={busy}
              heading={
                poster ? t('activities.clubEventFiles.poster.replace') : t('activities.clubEventFiles.poster.upload')
              }
              description={t('activities.clubEventFiles.poster.help')}
              browseLabel={
                poster ? t('activities.clubEventFiles.poster.replace') : t('activities.clubEventFiles.poster.upload')
              }
              onFilesSelected={(selected) => void upload(selected[0], 'poster')}
            />
            {problem('poster')}
          </>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="club-event-logos-heading">
        <h2 id="club-event-logos-heading" className="text-base font-semibold">
          {t('activities.clubEventFiles.logos.title', { count: logos.length, max: MAX_FUNDER_LOGOS })}
        </h2>
        {logos.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="club-event-logos-empty">
            {t('activities.clubEventFiles.logos.empty')}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="club-event-logos">
            {logos.map((logo) => (
              <li key={logo.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-2">
                <Image
                  src={logo.url}
                  alt={logo.funderName ?? logo.fileName}
                  width={160}
                  height={96}
                  unoptimized
                  className="bg-muted h-24 w-full rounded object-contain"
                />
                <span className="text-sm font-medium break-words">{logo.funderName}</span>
                {editable ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={t('activities.clubEventFiles.actions.removeLogo', { name: logo.funderName ?? '' })}
                    onClick={() => void remove(logo)}
                  >
                    {t('activities.clubEventFiles.actions.remove')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          logosFull ? (
            <p className="text-muted-foreground text-sm" data-testid="club-event-logos-full">
              {t('activities.clubEventFiles.logos.full', { max: MAX_FUNDER_LOGOS })}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex max-w-md flex-col gap-1">
                <Label htmlFor="club-event-funder-name">{t('activities.clubEventFiles.logos.funderName')}</Label>
                <Input
                  id="club-event-funder-name"
                  value={funderName}
                  maxLength={FUNDER_NAME_MAX}
                  aria-invalid={nameTouched && !nameValid}
                  aria-describedby="club-event-funder-name-help"
                  onChange={(change) => {
                    setFunderName(change.target.value)
                  }}
                  onBlur={() => {
                    setNameTouched(true)
                  }}
                />
                <p
                  id="club-event-funder-name-help"
                  className={
                    nameTouched && !nameValid ? 'text-status-error-text text-xs' : 'text-muted-foreground text-xs'
                  }
                >
                  {nameTouched && !nameValid
                    ? t('activities.clubEventFiles.logos.funderNameInvalid', {
                        min: FUNDER_NAME_MIN,
                        max: FUNDER_NAME_MAX,
                      })
                    : t('activities.clubEventFiles.logos.funderNameHelp')}
                </p>
              </div>
              <FileUploadArea
                data-testid="club-event-logo-upload"
                accept={IMAGE_TYPES}
                multiple={false}
                maxSizeBytes={FUNDER_LOGO_MAX_BYTES}
                disabled={busy || !nameValid}
                heading={t('activities.clubEventFiles.logos.upload')}
                description={t('activities.clubEventFiles.logos.help')}
                browseLabel={t('activities.clubEventFiles.logos.upload')}
                onFilesSelected={(selected) => void upload(selected[0], 'funder_logo')}
              />
              {problem('funder_logo')}
            </div>
          )
        ) : null}
      </section>
      {ConfirmDialogElement}
    </div>
  )
}
