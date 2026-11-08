import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OrderCampaignPage } from '../../../../components/orders/OrderCampaignPage'

export default function PaymentsOrderCampaignPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <OrderCampaignPage id={id} />
      </PageBody>
    </Page>
  )
}
