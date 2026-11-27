import { ApplyForm } from '../../../../../../components/public/ApplyForm'

/**
 * `/p/[clubSlug]/sections/[sectionSlug]/apply` — the section sign-up form (sign-up form spec P-J2; #799). Sessionless;
 * the form reads `GET /api/enrolment/public/{club}/sections/{section}/form` and posts the application.
 */
export default function ApplyRoute({ params }: { params?: { clubSlug?: string; sectionSlug?: string } }) {
  return <ApplyForm clubSlug={params?.clubSlug ?? ''} sectionSlug={params?.sectionSlug ?? ''} />
}
