import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/applications/status/[token]` — sessionless status of an application (sign-up form spec P-J4; #799). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Your application',
  titleKey: 'enrolment.public.status.pageTitle',
}

export default metadata
