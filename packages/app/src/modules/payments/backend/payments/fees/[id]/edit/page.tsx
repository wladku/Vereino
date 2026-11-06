import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { FeeEditForm } from '../../../../../components/FeeForm'

export default function PaymentsFeeEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <FeeEditForm id={id} />
      </PageBody>
    </Page>
  )
}
