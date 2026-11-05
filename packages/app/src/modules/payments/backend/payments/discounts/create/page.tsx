import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DiscountRuleCreateForm } from '../../../../components/DiscountRuleForm'

export default function PaymentsDiscountCreatePage() {
  return (
    <Page>
      <PageBody>
        <DiscountRuleCreateForm />
      </PageBody>
    </Page>
  )
}
