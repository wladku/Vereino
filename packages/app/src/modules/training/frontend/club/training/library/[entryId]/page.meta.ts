import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/training/library/[entryId]` — one shared outline (training outlines spec M-O8, #685). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.library.use'],
  title: 'Shared outline',
  titleKey: 'training.library.entryTitle',
}

export default metadata
