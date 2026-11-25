import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/training/outlines/new` — a new outline, optionally for a session (`?occurrenceId=`) or as a recurring
 * activity's series outline (`?activityId=`) (training outlines spec M-O5, M-O6, #683).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.outlines.write'],
  title: 'New training outline',
  titleKey: 'training.editor.newTitle',
}

export default metadata
