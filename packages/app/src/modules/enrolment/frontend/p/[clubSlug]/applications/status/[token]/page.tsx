import { StatusView } from '../../../../../../components/public/StatusView'

/**
 * `/p/[clubSlug]/applications/status/[token]` — the status link of an application (sign-up form spec P-J4, DD-J07;
 * #799). Sessionless; the token goes to `POST /api/enrolment/public/{club}/applications/status` in the body and is
 * never shown. `next.config.ts` serves this path with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
 */
export default function StatusRoute({ params }: { params?: { clubSlug?: string; token?: string } }) {
  return <StatusView clubSlug={params?.clubSlug ?? ''} token={params?.token ?? ''} />
}
