'use client'
// The person's photo on the "Details" tab of B-10 (people life-cycle spec REQ-L12; #312): shown from the scoped route
// `GET /api/people/persons/{id}/photo`, uploaded at once (PNG, JPEG or WebP up to 5 MB; a new upload replaces it) and
// removed after a confirmation, with `people.manage`. The server checks the bytes and answers 422 for an SVG renamed
// `.png` or a larger file, shown as a flash. A change moves the person's version, so the record is read again
// (`onChanged`).
import * as React from 'react'
import Image from 'next/image'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PERSON_PHOTO_MAX_BYTES } from '../lib/person-photo'
import { errorMessage, personName, type PersonDetail } from './client-helpers'

/** The photo's address; the version in the query string makes the browser read a replaced photo again. */
export function personPhotoUrl(person: Pick<PersonDetail, 'id' | 'updatedAt'>): string {
  return `/api/people/persons/${encodeURIComponent(person.id)}/photo?v=${encodeURIComponent(person.updatedAt ?? '')}`
}

export function PersonPhotoPanel({ person, onChanged }: { person: PersonDetail; onChanged: () => Promise<void> }) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const url = `/api/people/persons/${encodeURIComponent(person.id)}/photo`
  const hasPhoto = Boolean(person.hasPhoto)

  const upload = async (files: File[]) => {
    const file = files.at(0)
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      await apiCallOrThrow(url, { method: 'POST', body }, { errorMessage: t('people.persons.photo.errors.upload') })
      flash(t('people.persons.photo.flash.uploaded'), 'success')
      await onChanged()
    } catch (err: unknown) {
      flash(errorMessage(err, t('people.persons.photo.errors.upload')), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const confirmed = await confirm({ title: t('people.persons.photo.confirm.remove'), variant: 'destructive' })
    if (!confirmed) return
    setBusy(true)
    try {
      await apiCallOrThrow(url, { method: 'DELETE' }, { errorMessage: t('people.persons.photo.errors.remove') })
      flash(t('people.persons.photo.flash.removed'), 'success')
      await onChanged()
    } catch (err: unknown) {
      flash(errorMessage(err, t('people.persons.photo.errors.remove')), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start"
      aria-label={t('people.persons.photo.title')}
      data-testid="person-photo-panel"
    >
      <div className="flex shrink-0 flex-col items-start gap-2">
        {hasPhoto ? (
          <Image
            src={personPhotoUrl(person)}
            alt={t('people.persons.photo.alt', { name: personName(person) })}
            width={128}
            height={128}
            unoptimized
            className="bg-muted aspect-square w-32 rounded object-cover"
            data-testid="person-photo-image"
          />
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="person-photo-empty">
            {t('people.persons.photo.empty')}
          </p>
        )}
        {hasPhoto ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove()}>
            {t('people.persons.photo.remove')}
          </Button>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <FileUploadArea
          accept="image/png,image/jpeg,image/webp"
          multiple={false}
          maxSizeBytes={PERSON_PHOTO_MAX_BYTES}
          disabled={busy}
          heading={hasPhoto ? t('people.persons.photo.replace') : t('people.persons.photo.upload')}
          description={t('people.persons.photo.help')}
          browseLabel={t('people.persons.photo.browse')}
          onFilesSelected={(files) => void upload(files)}
        />
      </div>
      {ConfirmDialogElement}
    </section>
  )
}
