import { ApplyForm } from '../../../../../../components/public/ApplyForm'
import { GROUP_QUERY_PARAM } from '../../../../../../lib/paths'

/**
 * `/p/[clubSlug]/sections/[sectionSlug]/apply` — the section sign-up form (sign-up form spec P-J2; #799). Sessionless;
 * the form reads `GET /api/enrolment/public/{club}/sections/{section}/form` and posts the application. `?group={id}`
 * (the group sign-up QR code, #869) starts the form with that group chosen, or shows "closed" when it is not offered.
 */
export default function ApplyRoute({
  params,
  searchParams,
}: {
  params?: { clubSlug?: string; sectionSlug?: string }
  searchParams?: Record<string, string | string[] | undefined>
}) {
  return (
    <ApplyForm
      clubSlug={params?.clubSlug ?? ''}
      sectionSlug={params?.sectionSlug ?? ''}
      groupParam={searchParams?.[GROUP_QUERY_PARAM]}
    />
  )
}
