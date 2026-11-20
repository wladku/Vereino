'use client'
// The files block of the phone event page (club events spec REQ-T08, REQ-T12, UI row `/club/club-events/[id]`;
// E14-S05, #380): the poster with its preview and the funder logos with their names, and — for the event's organisers
// while it is planned — an upload from the camera or from a file for the poster (replacing the live one) and for a logo
// (after the funder's name), with full-width 44 px buttons. The uploads and removals are the panel's
// (`useClubEventFiles`): the server checks the bytes and its refusals are shown under the upload; a status names the
// file while it uploads.
import * as React from 'react'
import Image from 'next/image'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { FUNDER_NAME_MAX, FUNDER_NAME_MIN, MAX_FUNDER_LOGOS } from '../../lib/club-event-files'
import type { ClubEventDetail } from '../club-events-client'
import { CLUB_EVENT_IMAGE_TYPES, useClubEventFiles, type ClubEventFileKind } from '../useClubEventFiles'

/** "Take a photo" and "Choose a file" for one kind: two hidden inputs, the first one opening the camera. */
function UploadButtons({
  kind,
  disabled,
  label,
  onFile,
}: {
  kind: ClubEventFileKind
  disabled: boolean
  label: string
  onFile: (file: File | undefined) => void
}) {
  const t = useT()
  const camera = React.useRef<HTMLInputElement | null>(null)
  const picker = React.useRef<HTMLInputElement | null>(null)
  const take = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    onFile(file)
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={label}>
      <input
        ref={camera}
        type="file"
        accept={CLUB_EVENT_IMAGE_TYPES}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`club-event-member-${kind}-camera`}
        onChange={(change) => {
          take(change.currentTarget)
        }}
      />
      <input
        ref={picker}
        type="file"
        accept={CLUB_EVENT_IMAGE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`club-event-member-${kind}-file`}
        onChange={(change) => {
          take(change.currentTarget)
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:w-auto"
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        {t('activities.clubEvents.club.files.camera')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:w-auto"
        disabled={disabled}
        onClick={() => picker.current?.click()}
      >
        {t('activities.clubEvents.club.files.file')}
      </Button>
    </div>
  )
}

export function ClubEventFilesBlock({
  event,
  editable,
  onChanged,
}: {
  event: ClubEventDetail
  editable: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const files = useClubEventFiles(event, onChanged)
  const nameInvalid = files.nameTouched && !files.nameValid
  const problem = (kind: ClubEventFileKind) =>
    files.problems[kind] ? (
      <p role="alert" className="text-status-error-text text-sm" data-testid={`club-event-member-${kind}-error`}>
        {files.problems[kind]}
      </p>
    ) : null
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border p-4"
      aria-labelledby="club-event-member-files-heading"
      data-testid="club-event-member-files"
    >
      <h2 id="club-event-member-files-heading" className="text-lg font-semibold">
        {t('activities.clubEvents.club.files.title', { count: files.logos.length })}
      </h2>
      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {files.uploading ? (
          <span
            className="text-muted-foreground inline-flex items-center gap-2"
            data-testid="club-event-member-uploading"
          >
            <Spinner size="sm" />
            {t('activities.clubEventFiles.uploading', { name: files.uploading })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t('activities.clubEventFiles.poster.title')}</h3>
        {files.poster ? (
          <figure className="flex flex-col gap-2" data-testid="club-event-member-poster">
            <Image
              src={files.poster.url}
              alt={t('activities.clubEventFiles.poster.alt', { name: event.name ?? '' })}
              width={240}
              height={340}
              unoptimized
              className="bg-muted h-auto max-h-96 w-full max-w-60 rounded-md border object-contain"
            />
            <figcaption className="text-muted-foreground text-xs break-all">{files.poster.fileName}</figcaption>
          </figure>
        ) : (
          <p className="text-muted-foreground text-sm">{t('activities.clubEventFiles.poster.empty')}</p>
        )}
        {editable ? (
          <>
            <p className="text-muted-foreground text-sm">{t('activities.clubEventFiles.poster.help')}</p>
            <UploadButtons
              kind="poster"
              disabled={files.busy}
              label={t(
                files.poster ? 'activities.clubEventFiles.poster.replace' : 'activities.clubEventFiles.poster.upload',
              )}
              onFile={(file) => void files.upload(file, 'poster')}
            />
            {problem('poster')}
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">
          {t('activities.clubEventFiles.logos.title', { count: files.logos.length, max: MAX_FUNDER_LOGOS })}
        </h3>
        {files.logos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('activities.clubEventFiles.logos.empty')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3" data-testid="club-event-member-logos">
            {files.logos.map((logo) => (
              <li key={logo.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-2">
                <Image
                  src={logo.url}
                  alt={logo.funderName ?? logo.fileName}
                  width={160}
                  height={96}
                  unoptimized
                  className="bg-muted h-20 w-full rounded object-contain"
                />
                <span className="text-sm font-medium break-words">{logo.funderName}</span>
                {editable ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={files.busy}
                    aria-label={t('activities.clubEventFiles.actions.removeLogo', { name: logo.funderName ?? '' })}
                    onClick={() => void files.remove(logo)}
                  >
                    {t('activities.clubEventFiles.actions.remove')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {editable && !files.logosFull ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="club-event-member-funder-name">{t('activities.clubEventFiles.logos.funderName')}</Label>
              <Input
                id="club-event-member-funder-name"
                className="min-h-11"
                value={files.funderName}
                maxLength={FUNDER_NAME_MAX}
                aria-invalid={nameInvalid}
                aria-describedby="club-event-member-funder-name-help"
                onChange={(change) => {
                  files.setFunderName(change.target.value)
                }}
                onBlur={() => {
                  files.setNameTouched(true)
                }}
                data-testid="club-event-member-funder-name"
              />
              <p
                id="club-event-member-funder-name-help"
                className={nameInvalid ? 'text-status-error-text text-xs' : 'text-muted-foreground text-xs'}
              >
                {nameInvalid
                  ? t('activities.clubEventFiles.logos.funderNameInvalid', {
                      min: FUNDER_NAME_MIN,
                      max: FUNDER_NAME_MAX,
                    })
                  : t('activities.clubEventFiles.logos.funderNameHelp')}
              </p>
            </div>
            <UploadButtons
              kind="funder_logo"
              disabled={files.busy || !files.nameValid}
              label={t('activities.clubEventFiles.logos.upload')}
              onFile={(file) => void files.upload(file, 'funder_logo')}
            />
            {problem('funder_logo')}
          </div>
        ) : null}
        {editable && files.logosFull ? (
          <p className="text-muted-foreground text-sm">
            {t('activities.clubEventFiles.logos.full', { max: MAX_FUNDER_LOGOS })}
          </p>
        ) : null}
      </div>
      {files.ConfirmDialogElement}
    </section>
  )
}
