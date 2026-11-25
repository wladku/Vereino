import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/training/outlines/[id]` — one outline, edited on the phone (training outlines spec M-O5, #683). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.outlines.write'],
  title: 'Training outline',
  titleKey: 'training.editor.title',
}

export default metadata
