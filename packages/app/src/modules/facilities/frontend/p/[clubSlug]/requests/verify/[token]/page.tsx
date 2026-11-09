import { RequestVerifyView } from '../../../../../../components/public/RequestVerifyView'

/**
 * `/p/[clubSlug]/requests/verify/[token]` — the confirmation link of an online booking request (facilities spec P-05,
 * DD-44; #125). Sessionless; the token goes to `POST /api/facilities/public/requests/verify` in the body and is never
 * shown. `next.config.ts` serves this path with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
 */
export default function RequestVerifyRoute({ params }: { params?: { clubSlug?: string; token?: string } }) {
  return <RequestVerifyView clubSlug={params?.clubSlug ?? ''} token={params?.token ?? ''} />
}
