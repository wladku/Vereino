// Staff read of a place's files (UX parity spec, REQ-U03; #86): the regulations PDF and the photos on the place form.
// The place must be live in the session's organization and inside the caller's scope (the club administrator, like
// the place list) — `assertInScope` answers 403 `scope_denied` otherwise. The files are private: the links point to
// the platform's authenticated attachment routes (same organization only).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { assertInScope, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { STRUCTURE_READ_KINDS } from '../api/shared'
import { Place, PlaceFile } from '../data/entities'
import { staffLogoUrl } from '../lib/files'

export type StaffPlaceFileItem = {
  id: string
  kind: 'photo' | 'regulations'
  fileName: string
  mimeType: string
  size: number
  position: number
  /** The file through the platform's authenticated attachment route. */
  url: string
  /** A small preview of a photo; null for the regulations PDF. */
  thumbnailUrl: string | null
  createdAt: string
}

export async function listPlaceFiles(
  ctx: CommandRuntimeContext,
  placeId: string,
): Promise<{ items: StaffPlaceFileItem[] }> {
  const trusted = trustedScopeOf(ctx)
  if (!trusted) throw notFound('Not found')
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const place = await em.findOne(Place, { id: placeId, ...trusted, deletedAt: null }, { fields: ['id'] })
  if (!place) throw notFound('Not found')
  const scope = await scopeContract.resolve(ctx)
  await assertInScope(scope, STRUCTURE_READ_KINDS, { id: place.id, ...trusted })
  const rows = await em.find(
    PlaceFile,
    { placeId: place.id, ...trusted, deletedAt: null },
    { orderBy: { kind: 'desc', position: 'asc', createdAt: 'asc' } },
  )
  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind === 'regulations' ? 'regulations' : 'photo',
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.fileSize,
      position: row.position,
      url: `/api/attachments/file/${row.attachmentId}`,
      thumbnailUrl: row.kind === 'photo' ? staffLogoUrl(row.attachmentId, 160) : null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
