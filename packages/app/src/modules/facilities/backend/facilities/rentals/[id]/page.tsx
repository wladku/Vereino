import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RentalRecord } from '../../../../components/RentalRecord'

export default function FacilitiesRentalRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <RentalRecord id={id} />
      </PageBody>
    </Page>
  )
}
