import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DiscountRulesTable } from '../../../components/DiscountRulesTable'

export default function PaymentsDiscountsPage() {
  return (
    <Page>
      <PageBody>
        <DiscountRulesTable />
      </PageBody>
    </Page>
  )
}
