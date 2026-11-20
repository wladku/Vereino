'use client'
// The Files tab of the club event record (club events spec B-T3, REQ-T08, DD-T10, J-T02 step 2; #379): the poster with
// a preview and **Replace**, and the funder logos with their names and **Remove**, in upload order. A logo is uploaded
// with the funder's name (2–120 characters, the image's alternative text). The server checks the bytes — PNG, JPEG or
// WebP; a poster up to 5 MB, a logo up to 2 MB, at most 12 logos — and its 422 codes are shown beside the upload. While
// a file uploads, a status names it. Removing asks first and sends the file's lock token; the removal is undoable. A
// reader who does not manage the event, or a cancelled event, sees the files without the actions.
import Image from 'next/image'
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
} from '../lib/club-event-files'
import type { ClubEventDetail } from './club-events-client'
import {
  CLUB_EVENT_IMAGE_TYPES as IMAGE_TYPES,
  useClubEventFiles,
  type ClubEventFileKind as Kind,
} from './useClubEventFiles'

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
  const {
    poster,
    logos,
    uploading,
    busy,
    problems,
    funderName,
    setFunderName,
    nameTouched,
    setNameTouched,
    nameValid,
    logosFull,
    upload,
    remove,
    ConfirmDialogElement,
  } = useClubEventFiles(event, onChanged)

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
