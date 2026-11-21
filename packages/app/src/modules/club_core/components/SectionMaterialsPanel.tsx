'use client'
// The materials panel of the section edit page (club spec glossary *Section*: public materials, UI table "Public page"
// group; #29): the section's files with their public flag, an upload (PDF, PNG, JPEG, WebP up to 10 MB — the server
// checks the bytes), "Rename" in place with save and cancel (people life-cycle spec REQ-L12, #304: no new upload) and a
// confirmed removal. Only files marked public appear on the public page, and only while the club publishes the
// `materials` block. Every change sends the material's lock token; a stale one surfaces the conflict.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MATERIAL_MAX_BYTES } from '../lib/files'
import { errorMessage } from './client-helpers'
import { StatusTag } from '@vereino/ui'

type MaterialItem = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  isPublic: boolean
  downloadUrl: string
  updatedAt: string
}

export function SectionMaterialsPanel({ sectionId, canEdit }: { sectionId: string; canEdit: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [title, setTitle] = React.useState('')
  const [isPublic, setIsPublic] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)
  const renameInputRef = React.useRef<HTMLInputElement>(null)
  const renamingId = renaming?.id ?? null
  // "Rename" opens the title field with the focus in it.
  React.useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])
  const base = `/api/club_core/sections/${sectionId}/materials`
  const queryKey = ['club_core-section-materials', sectionId]
  const query = useQuery({
    queryKey,
    queryFn: () => readApiResultOrThrow<{ items: MaterialItem[] }>(base),
  })

  /** Runs a change and reports it; true when it was saved. */
  const run = async (action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    setBusy(true)
    try {
      await action()
      flash(success, 'success')
      return true
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, failure), 'error')
      return false
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey })
    }
  }

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    const file = files[0]
    const body = new FormData()
    body.append('file', file)
    body.append('title', title.trim() || file.name)
    body.append('isPublic', isPublic ? 'true' : 'false')
    await run(
      () => apiCallOrThrow(base, { method: 'POST', body }, { errorMessage: t('club_core.materials.errors.upload') }),
      t('club_core.materials.flash.uploaded'),
      t('club_core.materials.errors.upload'),
    )
    setTitle('')
  }

  const update = (item: MaterialItem, patch: { isPublic?: boolean; title?: string }) =>
    run(
      () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(item.updatedAt), () =>
          apiCallOrThrow(
            `${base}/${item.id}`,
            { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) },
            { errorMessage: t('club_core.materials.errors.save') },
          ),
        ),
      t('club_core.materials.flash.saved'),
      t('club_core.materials.errors.save'),
    )

  const togglePublic = (item: MaterialItem) => update(item, { isPublic: !item.isPublic })

  const rename = async (item: MaterialItem, title: string) => {
    const next = title.trim()
    if (!next) return
    if (next === item.title || (await update(item, { title: next }))) setRenaming(null)
  }

  const remove = async (item: MaterialItem) => {
    const confirmed = await confirm({ title: t('club_core.materials.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    await run(
      () =>
        withScopedApiRequestHeaders(buildOptimisticLockHeader(item.updatedAt), () =>
          apiCallOrThrow(
            `${base}/${item.id}`,
            { method: 'DELETE' },
            { errorMessage: t('club_core.materials.errors.delete') },
          ),
        ),
      t('club_core.materials.flash.deleted'),
      t('club_core.materials.errors.delete'),
    )
  }

  let list: React.ReactNode
  if (!query.data && query.isFetching) list = <LoadingMessage label={t('club_core.materials.loading')} />
  else if (!query.data) list = <ErrorMessage label={t('club_core.materials.errors.load')} />
  else if (query.data.items.length === 0) {
    list = <p className="text-muted-foreground text-sm">{t('club_core.materials.empty')}</p>
  } else {
    list = (
      <ul className="flex flex-col divide-y rounded-md border" data-testid="section-materials-list">
        {query.data.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3"
            data-testid="section-material"
            data-material-id={item.id}
          >
            {renaming?.id === item.id ? (
              <form
                className="flex min-w-0 flex-1 flex-wrap items-end gap-2"
                aria-label={t('club_core.materials.rename.label')}
                onSubmit={(event) => {
                  event.preventDefault()
                  void rename(item, renaming.title)
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label htmlFor={`section-material-rename-${item.id}`}>{t('club_core.materials.rename.label')}</Label>
                  <Input
                    id={`section-material-rename-${item.id}`}
                    value={renaming.title}
                    maxLength={200}
                    required
                    ref={renameInputRef}
                    disabled={busy}
                    data-testid="section-material-rename-input"
                    onChange={(event) => {
                      setRenaming({ id: item.id, title: event.target.value })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setRenaming(null)
                      }
                    }}
                  />
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !renaming.title.trim()}
                  data-testid="section-material-rename-save"
                >
                  {t('club_core.common.save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(null)
                  }}
                >
                  {t('club_core.common.cancel')}
                </Button>
              </form>
            ) : (
              <span className="flex flex-col">
                <a
                  className="font-medium underline underline-offset-4"
                  href={item.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="section-material-title"
                >
                  {item.title}
                </a>
                <span className="text-muted-foreground text-xs">{item.fileName}</span>
              </span>
            )}
            <span className="flex flex-wrap items-center gap-2">
              <StatusTag status={item.isPublic ? 'success' : 'neutral'}>
                {item.isPublic ? t('club_core.materials.public') : t('club_core.materials.internal')}
              </StatusTag>
              {canEdit ? (
                <>
                  {renaming?.id !== item.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      data-testid="section-material-rename"
                      onClick={() => {
                        setRenaming({ id: item.id, title: item.title })
                      }}
                    >
                      {t('club_core.materials.actions.rename')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void togglePublic(item)}
                  >
                    {item.isPublic
                      ? t('club_core.materials.actions.unpublish')
                      : t('club_core.materials.actions.publish')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void remove(item)}>
                    {t('club_core.common.delete')}
                  </Button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4" data-testid="section-materials-panel">
      <SectionHeader title={t('club_core.materials.title')} />
      <p className="text-muted-foreground max-w-prose text-sm">{t('club_core.materials.description')}</p>
      {list}
      {canEdit ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="section-material-title">{t('club_core.materials.fields.title')}</Label>
            <Input
              id="section-material-title"
              value={title}
              maxLength={200}
              onChange={(event) => {
                setTitle(event.target.value)
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="section-material-public"
              checked={isPublic}
              onCheckedChange={(value) => {
                setIsPublic(value === true)
              }}
            />
            <Label htmlFor="section-material-public">{t('club_core.materials.fields.isPublic')}</Label>
          </div>
          <FileUploadArea
            accept="application/pdf,image/png,image/jpeg,image/webp"
            multiple={false}
            maxSizeBytes={MATERIAL_MAX_BYTES}
            disabled={busy}
            heading={t('club_core.materials.upload.heading')}
            description={t('club_core.materials.upload.description')}
            browseLabel={t('club_core.materials.upload.browse')}
            onFilesSelected={(files) => void upload(files)}
          />
        </div>
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
