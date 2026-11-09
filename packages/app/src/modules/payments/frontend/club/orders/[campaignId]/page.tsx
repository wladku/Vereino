import { Suspense } from 'react'
import { ClubOrderPage } from '../../../../components/club/orders/ClubOrderPage'

/**
 * `/club/orders/[campaignId]` — M-17 (payments spec REQ-032; #116). The share text links here with `?club=<slug>`; the
 * list M-16 with `?child=<personId>`.
 */
export default function ClubOrderRoute({ params }: { params?: { campaignId?: string } }) {
  return (
    <Suspense>
      <ClubOrderPage campaignId={params?.campaignId ?? ''} />
    </Suspense>
  )
}
