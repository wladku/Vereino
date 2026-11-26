import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/training/library` — the shared outline library (training outlines spec M-O8, #685). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.library.use'],
  title: 'Outline library',
  titleKey: 'training.library.title',
}

export default metadata
