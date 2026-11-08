import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OrderCampaignCreateForm } from '../../../../components/orders/OrderCampaignForm'

export default function PaymentsOrderCampaignCreatePage() {
  return (
    <Page>
      <PageBody>
        <OrderCampaignCreateForm />
      </PageBody>
    </Page>
  )
}
