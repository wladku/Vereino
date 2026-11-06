import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DiscountRuleEditForm } from '../../../../../components/DiscountRuleForm'

export default function PaymentsDiscountEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <DiscountRuleEditForm id={id} />
      </PageBody>
    </Page>
  )
}
