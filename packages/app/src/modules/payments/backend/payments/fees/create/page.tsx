import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { FeeCreateForm } from '../../../../components/FeeForm'

export default function PaymentsFeeCreatePage() {
  return (
    <Page>
      <PageBody>
        <FeeCreateForm />
      </PageBody>
    </Page>
  )
}
