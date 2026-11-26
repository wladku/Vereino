import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/sections/[sectionSlug]/apply` — sessionless section sign-up form (sign-up form spec P-J2; #799). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Application',
  titleKey: 'enrolment.public.form.pageTitle',
}

export default metadata
