import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/identity/deletion` — the status page of a Facebook data-deletion request (social sign-in spec REQ-S03; #567). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Data deletion request',
  titleKey: 'foundation.identity.deletion.title',
}

export default metadata
