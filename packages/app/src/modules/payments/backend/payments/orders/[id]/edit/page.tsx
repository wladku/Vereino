import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OrderCampaignEditForm } from '../../../../../components/orders/OrderCampaignForm'

export default function PaymentsOrderCampaignEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <OrderCampaignEditForm id={id} />
      </PageBody>
    </Page>
  )
}
