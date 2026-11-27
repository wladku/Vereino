'use client'
// The pictures of the club event record's Files tab (event photos spec B-T3, REQ-I01–REQ-I04, J-I02; #872), for the
// event's managers only (the read returns `pictures` to them alone): "Add photos" (several files, each with its own
// progress line), a table of the pictures in their order — thumbnail, description, kind and people, state — with the
// row actions Edit, Who is in the photo?, Publish or Unpublish, Move up or down and Delete, and "Publish all". The
// state "Waiting for consent (n)" opens the names of the marked people without consent. The actions and dialogs are
// the phone block's (`useClubEventPictures`, `ClubEventPictureDialogs`).
import * as React from 'react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_PICTURES } from '../lib/club-event-files'
import {
  PictureDialogs,
  PictureStateTag,
  PictureUploads,
  pictureActionItems,
  type PicturePending,
} from './club/ClubEventPicturesBlock'
import type { TableColumns } from './client-helpers'
import type { ClubEventDetail, ClubEventPictureItem } from './club-events-client'
import { CLUB_EVENT_IMAGE_TYPES } from './useClubEventFiles'
import { useClubEventPictures } from './useClubEventPictures'

export function ClubEventPicturesPanel({
  event,
  onChanged,
}: {
  event: ClubEventDetail
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const api = useClubEventPictures(event, onChanged)
  const [pending, setPending] = React.useState<PicturePending>(null)
  const picker = React.useRef<HTMLInputElement | null>(null)
  const open = event.status !== 'cancelled'
  const columns = React.useMemo<TableColumns<ClubEventPictureItem>>(
    () => [
      {
        id: 'picture',
        header: t('activities.clubEvents.pictures.columns.picture'),
        enableSorting: false,
        meta: { priority: 1 },
        cell: ({ row }) => (
          // eslint-disable-next-line @next/next/no-img-element -- a manager-only, uncached route
          <img
            src={row.original.url}
            alt={row.original.description}
            loading="lazy"
            className="bg-muted h-14 w-14 rounded object-cover"
          />
        ),
      },
      {
        id: 'description',
        header: t('activities.clubEvents.pictures.columns.description'),
        enableSorting: false,
        meta: { priority: 1 },
        cell: ({ row }) => <span className="font-medium break-words">{row.original.description}</span>,
      },
      {
        id: 'kind',
        header: t('activities.clubEvents.pictures.columns.kind'),
        enableSorting: false,
        meta: { priority: 3 },
        cell: ({ row }) =>
          row.original.kind === 'graphic'
            ? t('activities.clubEvents.pictures.kind.graphic')
            : t('activities.clubEvents.pictures.kindWithPeople', { count: row.original.marks.length }),
      },
      {
        id: 'state',
        header: t('activities.clubEvents.pictures.columns.state'),
        enableSorting: false,
        meta: { priority: 2 },
        cell: ({ row }) =>
          row.original.state === 'waiting_for_consent' ? (
            <button
              type="button"
              className="rounded focus-visible:ring-2"
              onClick={() => {
                setPending({ kind: 'missing', picture: row.original })
              }}
              data-testid="club-event-picture-missing"
            >
              <PictureStateTag picture={row.original} />
            </button>
          ) : (
            <PictureStateTag picture={row.original} />
          ),
      },
    ],
    [t],
  )
  const addButton =
    open && !api.full ? (
      <>
        <input
          ref={picker}
          type="file"
          accept={CLUB_EVENT_IMAGE_TYPES}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="club-event-pictures-file"
          onChange={(change) => {
            const files = [...(change.currentTarget.files ?? [])]
            change.currentTarget.value = ''
            void api.uploadMany(files)
          }}
        />
        <Button
          type="button"
          disabled={api.busy}
          onClick={() => picker.current?.click()}
          data-testid="club-event-pictures-add"
        >
          {t('activities.clubEvents.pictures.add')}
        </Button>
      </>
    ) : null
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="club-event-pictures-heading"
      data-testid="club-event-pictures"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="club-event-pictures-heading" className="text-base font-semibold">
          {t('activities.clubEvents.pictures.title', { count: api.pictures.length, max: MAX_PICTURES })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {open && api.hasDrafts ? (
            <Button
              type="button"
              variant="outline"
              disabled={api.busy}
              onClick={() => void api.publishAll()}
              data-testid="club-event-pictures-publish-all"
            >
              {t('activities.clubEvents.pictures.actions.publishAll')}
            </Button>
          ) : null}
          {api.pictures.length > 0 ? addButton : null}
        </div>
      </div>
      <p className="text-muted-foreground text-sm">{t('activities.clubEvents.pictures.help')}</p>
      <PictureUploads api={api} />
      {api.pictures.length === 0 ? (
        <div data-testid="club-event-pictures-empty">
          <EmptyState
            title={t('activities.clubEvents.pictures.emptyTitle')}
            description={t('activities.clubEvents.pictures.empty')}
            actions={addButton ?? undefined}
          />
        </div>
      ) : (
        <DataTable<ClubEventPictureItem>
          embedded
          columns={columns}
          data={api.pictures}
          rowActions={(picture) => (
            <RowActions
              items={pictureActionItems(
                t,
                api,
                picture,
                api.pictures.findIndex((entry) => entry.id === picture.id),
                open,
                setPending,
              )}
            />
          )}
          disableRowClick
        />
      )}
      <PictureDialogs eventId={event.id} api={api} pending={pending} setPending={setPending} />
      {api.ConfirmDialogElement}
    </section>
  )
}
