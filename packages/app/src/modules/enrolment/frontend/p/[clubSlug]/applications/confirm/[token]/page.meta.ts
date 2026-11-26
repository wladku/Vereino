import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/applications/confirm/[token]` — sessionless confirmation of an application (sign-up form spec P-J3; #799). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Application confirmation',
  titleKey: 'enrolment.public.confirm.pageTitle',
}

export default metadata
