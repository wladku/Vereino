import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/training/outlines/[id]/print` — the outline in the PZPN layout, printed to PDF (training outlines spec M-O7, #683). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['training.outlines.write'],
  title: 'Training outline — print',
  titleKey: 'training.print.pageTitle',
}

export default metadata
