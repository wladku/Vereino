import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RateEditForm } from '../../../../../components/RateForm'

export default function FacilitiesRatesEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <RateEditForm id={id} />
      </PageBody>
    </Page>
  )
}
