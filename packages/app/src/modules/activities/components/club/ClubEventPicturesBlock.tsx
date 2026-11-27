'use client'
// The Pictures block of the phone event page (event photos spec REQ-I01–REQ-I04, J-I02, UI row `/club/club-events/[id]`
// — Pictures block; #872), for the event's managers only (the read returns `pictures` to them alone): "Add photos"
// from the camera or the files (several at once, each with its own progress line), and per picture its description,
// kind, people and state, with Edit, Who is in the photo?, Publish or Unpublish, Move up or down and Delete; "Publish
// all" publishes every confirmed draft. "Waiting for consent (n)" opens the names of the marked people without
// consent. A cancelled event keeps its pictures: only Unpublish and Delete stay.
import * as React from 'react'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { MAX_PICTURES } from '../../lib/club-event-files'
import { MissingConsentDialog, PictureEditDialog, PicturePeopleDialog } from '../ClubEventPictureDialogs'
import type { ClubEventDetail, ClubEventPictureItem } from '../club-events-client'
import { CLUB_EVENT_IMAGE_TYPES } from '../useClubEventFiles'
import { PICTURE_STATE_TONES, useClubEventPictures, type ClubEventPicturesApi } from '../useClubEventPictures'

type Pending = { kind: 'people' | 'edit' | 'missing'; picture: ClubEventPictureItem } | null

/** The actions of one picture, in the wireframe's order; `open` is false on a cancelled event. */
export function pictureActionItems(
  t: ReturnType<typeof useT>,
  api: ClubEventPicturesApi,
  picture: ClubEventPictureItem,
  index: number,
  open: boolean,
  setPending: (pending: Pending) => void,
): RowActionItem[] {
  const items: RowActionItem[] = []
  if (open) {
    items.push(
      {
        id: 'edit',
        label: t('activities.clubEvents.pictures.actions.edit'),
        onSelect: () => {
          setPending({ kind: 'edit', picture })
        },
      },
      {
        id: 'people',
        label: t(
          picture.kind === 'graphic'
            ? 'activities.clubEvents.pictures.actions.confirmGraphic'
            : 'activities.clubEvents.pictures.actions.people',
        ),
        onSelect: () => {
          setPending({ kind: 'people', picture })
        },
      },
    )
  }
  if (picture.publishedAt) {
    items.push({
      id: 'unpublish',
      label: t('activities.clubEvents.pictures.actions.unpublish'),
      onSelect: () => void api.unpublish(picture),
    })
  } else if (open) {
    items.push({
      id: 'publish',
      label: t('activities.clubEvents.pictures.actions.publish'),
      onSelect: () => void api.publish(picture),
    })
  }
  if (open && index > 0) {
    items.push({
      id: 'up',
      label: t('activities.clubEvents.pictures.actions.moveUp'),
      onSelect: () => void api.move(picture, -1),
    })
  }
  if (open && index < api.pictures.length - 1) {
    items.push({
      id: 'down',
      label: t('activities.clubEvents.pictures.actions.moveDown'),
      onSelect: () => void api.move(picture, 1),
    })
  }
  items.push({
    id: 'remove',
    label: t('activities.clubEvents.pictures.actions.remove'),
    destructive: true,
    onSelect: () => void api.remove(picture),
  })
  return items
}

/** The state tag of a picture; "waiting for consent" with its count. */
export function PictureStateTag({ picture }: { picture: ClubEventPictureItem }) {
  const t = useT()
  return (
    <StatusTag status={PICTURE_STATE_TONES[picture.state]} data-testid="club-event-picture-state">
      {t(`activities.clubEvents.pictures.state.${picture.state}`, { count: picture.missingConsentCount })}
    </StatusTag>
  )
}

/** The progress lines of the files being uploaded. */
export function PictureUploads({ api }: { api: ClubEventPicturesApi }) {
  const t = useT()
  if (api.uploads.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-live="polite" data-testid="club-event-picture-uploads">
      {api.uploads.map((entry) => (
        <li key={entry.key} className="flex items-center gap-2" data-status={entry.status}>
          {entry.status === 'uploading' ? <Spinner size="sm" /> : null}
          <span className="min-w-0 truncate">{entry.name}</span>
          <span
            className={
              entry.status === 'error'
                ? 'text-status-error-text ml-auto text-xs'
                : 'text-muted-foreground ml-auto text-xs'
            }
            role={entry.status === 'error' ? 'alert' : undefined}
          >
            {entry.status === 'error' ? entry.error : t(`activities.clubEvents.pictures.upload.${entry.status}`)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The picture dialogs for the pending action. */
export function PictureDialogs({
  eventId,
  api,
  pending,
  setPending,
}: {
  eventId: string
  api: ClubEventPicturesApi
  pending: Pending
  setPending: (pending: Pending) => void
}) {
  const close = (open: boolean) => {
    if (!open) setPending(null)
  }
  if (!pending) return null
  if (pending.kind === 'people') {
    return (
      <PicturePeopleDialog
        key={pending.picture.id}
        eventId={eventId}
        picture={pending.picture}
        open
        busy={api.busy}
        onOpenChange={close}
        onSave={(personIds, confirmed) => api.setPeople(pending.picture, personIds, confirmed)}
      />
    )
  }
  if (pending.kind === 'edit') {
    return (
      <PictureEditDialog
        key={pending.picture.id}
        picture={pending.picture}
        open
        busy={api.busy}
        onOpenChange={close}
        onSave={(patch) => api.update(pending.picture, patch)}
      />
    )
  }
  return <MissingConsentDialog picture={pending.picture} open onOpenChange={close} />
}

export type { Pending as PicturePending }

export function ClubEventPicturesBlock({
  event,
  onChanged,
}: {
  event: ClubEventDetail
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const api = useClubEventPictures(event, onChanged)
  const [pending, setPending] = React.useState<Pending>(null)
  const camera = React.useRef<HTMLInputElement | null>(null)
  const picker = React.useRef<HTMLInputElement | null>(null)
  const open = event.status !== 'cancelled'
  const take = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])]
    input.value = ''
    void api.uploadMany(files)
  }
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border p-4"
      aria-labelledby="club-event-member-pictures-heading"
      data-testid="club-event-member-pictures"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="club-event-member-pictures-heading" className="text-lg font-semibold">
          {t('activities.clubEvents.pictures.title', { count: api.pictures.length, max: MAX_PICTURES })}
        </h2>
      </div>
      {open && !api.full ? (
        <div
          className="flex flex-col gap-2 sm:flex-row"
          role="group"
          aria-label={t('activities.clubEvents.pictures.add')}
        >
          <input
            ref={camera}
            type="file"
            accept={CLUB_EVENT_IMAGE_TYPES}
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="club-event-member-pictures-camera"
            onChange={(change) => {
              take(change.currentTarget)
            }}
          />
          <input
            ref={picker}
            type="file"
            accept={CLUB_EVENT_IMAGE_TYPES}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="club-event-member-pictures-file"
            onChange={(change) => {
              take(change.currentTarget)
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={api.busy}
            onClick={() => camera.current?.click()}
          >
            {t('activities.clubEvents.club.files.camera')}
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={api.busy}
            onClick={() => picker.current?.click()}
            data-testid="club-event-member-pictures-add"
          >
            {t('activities.clubEvents.pictures.add')}
          </Button>
        </div>
      ) : null}
      {open && api.full ? (
        <p className="text-muted-foreground text-sm">{t('activities.errors.club_event_pictures_limit')}</p>
      ) : null}
      <PictureUploads api={api} />
      {api.pictures.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="club-event-member-pictures-empty">
          {t('activities.clubEvents.pictures.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="club-event-member-picture-list">
          {api.pictures.map((picture, index) => (
            <li
              key={picture.id}
              className="flex items-start gap-3 rounded-md border p-2"
              data-testid="club-event-member-picture"
              data-picture-id={picture.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a manager-only, uncached route */}
              <img
                src={picture.url}
                alt={picture.description}
                loading="lazy"
                className="bg-muted h-20 w-20 shrink-0 rounded object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium break-words">{picture.description}</span>
                <span className="text-muted-foreground text-xs">
                  {picture.kind === 'graphic'
                    ? t('activities.clubEvents.pictures.kind.graphic')
                    : t('activities.clubEvents.pictures.kindWithPeople', { count: picture.marks.length })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {picture.state === 'waiting_for_consent' ? (
                    <button
                      type="button"
                      className="min-h-9 rounded text-left underline-offset-2 hover:underline focus-visible:ring-2"
                      onClick={() => {
                        setPending({ kind: 'missing', picture })
                      }}
                      data-testid="club-event-picture-missing"
                    >
                      <PictureStateTag picture={picture} />
                    </button>
                  ) : (
                    <PictureStateTag picture={picture} />
                  )}
                </div>
              </div>
              <RowActions items={pictureActionItems(t, api, picture, index, open, setPending)} />
            </li>
          ))}
        </ul>
      )}
      {open && api.hasDrafts ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={api.busy}
            onClick={() => void api.publishAll()}
            data-testid="club-event-pictures-publish-all"
          >
            {t('activities.clubEvents.pictures.actions.publishAll')}
          </Button>
        </div>
      ) : null}
      <PictureDialogs eventId={event.id} api={api} pending={pending} setPending={setPending} />
      {api.ConfirmDialogElement}
    </section>
  )
}
