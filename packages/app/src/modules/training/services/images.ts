// The image files of outlines (training outlines spec `/api/training/outlines/[id]/images`; #683): an image is read
// only through an outline that references it, with the exact owner (the outline that uploaded it — a session copy
// shares its series outline's images), owner assignment and private partition, so the route never serves another
// file; and a file an outline no longer references is released once no live outline of the club references it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AwilixContainer } from 'awilix'
import { outlineImageReferences } from '../data/queries'
import { OUTLINE_IMAGE_OWNER_ENTITY, OUTLINE_IMAGE_PARTITION } from '../lib/images'
import type { OutlineImageRef } from '../lib/outline'
import type { TrainingScope } from './directory'

function attachments(container: AwilixContainer): AttachmentService | null {
  return container.hasRegistration('attachmentService')
    ? container.resolve<AttachmentService>('attachmentService')
    : null
}

/** The owner and the owner assignment of an image (lesson `attachment-owner-assignment-and-release`). */
export function imageOwner(image: OutlineImageRef) {
  return {
    expectedOwner: { entityId: OUTLINE_IMAGE_OWNER_ENTITY, recordId: image.ownerOutlineId },
    expectedAssignment: { type: OUTLINE_IMAGE_OWNER_ENTITY, id: image.ownerOutlineId },
    expectedPartitionCode: OUTLINE_IMAGE_PARTITION,
  }
}

/**
 * Releases each image no live outline references any more (after the commit of the edit that dropped it). A file
 * still referenced — by a session copy, say — stays; a failed release keeps the file and is not an error of the edit.
 */
export async function releaseUnusedImages(
  container: AwilixContainer,
  scope: TrainingScope,
  images: readonly OutlineImageRef[],
): Promise<{ released: number; kept: number }> {
  const service = attachments(container)
  const counts = { released: 0, kept: 0 }
  if (!service?.releaseScoped) return { released: 0, kept: images.length }
  const em = container.resolve<EntityManager>('em').fork()
  for (const image of images) {
    if ((await outlineImageReferences(em, scope, image.attachmentId)) > 0) {
      counts.kept += 1
      continue
    }
    try {
      await service.releaseScoped({ attachmentId: image.attachmentId, ...scope, ...imageOwner(image) })
      counts.released += 1
    } catch {
      counts.kept += 1
    }
  }
  return counts
}

export type ImageFile = { buffer: Buffer; mimeType: string; fileName: string }

/** The bytes of an image the outline references, read as its owner's file; null when it is not available. */
export async function readOutlineImage(
  container: AwilixContainer,
  auth: Parameters<AttachmentService['readScoped']>[0]['auth'],
  image: OutlineImageRef,
): Promise<ImageFile | null> {
  const service = attachments(container)
  if (!service) return null
  try {
    const file = await service.readScoped({
      attachmentId: image.attachmentId,
      auth,
      ...imageOwner(image),
      requirePrivatePartition: true,
    })
    return { buffer: file.buffer, mimeType: file.mimeType, fileName: file.fileName }
  } catch {
    return null
  }
}
