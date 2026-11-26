import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/library/o/[entryId]` — a training outline shared with the public (training outlines spec P-O1, DD-O15; #685).
 * Sessionless, on the platform host; `noindex` until the owner decides (Q-O03).
 */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Training outline',
  titleKey: 'training.public.pageTitle',
}

export default metadata
