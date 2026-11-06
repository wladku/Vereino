import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ChargeRecord } from '../../../../components/ChargeRecord'

export default function PaymentsChargeRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ChargeRecord id={id} />
      </PageBody>
    </Page>
  )
}
