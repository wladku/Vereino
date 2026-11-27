import { ConfirmView } from '../../../../../../components/public/ConfirmView'

/**
 * `/p/[clubSlug]/applications/confirm/[token]` — the confirmation link of an application (sign-up form spec P-J3,
 * DD-J06; #799). Sessionless; opening it spends nothing: the applicant presses "Confirm my application", which posts
 * the token to `POST /api/enrolment/public/{club}/applications/confirm` in the body. The token is never shown.
 * `next.config.ts` serves this path with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
 */
export default function ConfirmRoute({ params }: { params?: { clubSlug?: string; token?: string } }) {
  return <ConfirmView clubSlug={params?.clubSlug ?? ''} token={params?.token ?? ''} />
}
