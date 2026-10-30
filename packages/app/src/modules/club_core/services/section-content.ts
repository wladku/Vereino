// Staff reads of a section's public content (#29): the materials list of the section edit page. The section must be
// live in the session's organization and inside the caller's scope (the same kinds as the section list: the club
// administrator, or a coordinator of that section) — `assertInScope` answers 403 `scope_denied` otherwise.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { assertInScope, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { Section, SectionMaterial } from '../data/entities'
import { SECTION_READ_KINDS } from '../api/shared'

export type StaffMaterialItem = {
  id: string
  sectionId: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  isPublic: boolean
  /** The file through the platform's authenticated attachment route (same organization only). */
  downloadUrl: string
  createdAt: string
  updatedAt: string
}

export async function listSectionMaterials(
  ctx: CommandRuntimeContext,
  sectionId: string,
): Promise<{ items: StaffMaterialItem[] }> {
  const trusted = trustedScopeOf(ctx)
  if (!trusted) throw notFound('Not found')
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const section = await em.findOne(Section, { id: sectionId, ...trusted, deletedAt: null })
  if (!section) throw notFound('Not found')
  const scope = await scopeContract.resolve(ctx)
  await assertInScope(scope, SECTION_READ_KINDS, { id: section.id, ...trusted, sectionId: section.id })
  const rows = await em.find(
    SectionMaterial,
    { sectionId: section.id, ...trusted, deletedAt: null },
    { orderBy: { title: 'asc' } },
  )
  return {
    items: rows.map((row) => ({
      id: row.id,
      sectionId: row.sectionId,
      title: row.title,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      isPublic: row.isPublic,
      downloadUrl: `/api/attachments/file/${row.attachmentId}`,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  }
}
