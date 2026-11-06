import { Suspense } from 'react'
import { DeclarationLinkRequestView } from '../../../components/public/DeclarationLinkRequestView'

/**
 * `/club/link` — the personal declaration link request (club spec REQ-017; UX concept M-13). Sessionless; reached from
 * the public session page with `?club=<slug>&session=<id>`; posts to `POST /api/activities/declaration-links`.
 */
export default function DeclarationLinkRequestRoute() {
  return (
    <Suspense>
      <DeclarationLinkRequestView />
    </Suspense>
  )
}
