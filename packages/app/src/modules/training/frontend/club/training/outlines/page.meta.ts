import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/training/outlines` — the coach's training outlines (training outlines spec M-O5, #683). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.outlines.write'],
  title: 'Training outlines',
  titleKey: 'training.list.title',
}

export default metadata
