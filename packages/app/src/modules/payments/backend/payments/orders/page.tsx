import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OrderCampaignsTable } from '../../../components/orders/OrderCampaignsTable'

export default function PaymentsOrderCampaignsPage() {
  return (
    <Page>
      <PageBody>
        <OrderCampaignsTable />
      </PageBody>
    </Page>
  )
}
