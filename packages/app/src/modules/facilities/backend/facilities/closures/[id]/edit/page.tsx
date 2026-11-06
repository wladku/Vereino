import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ClosureEditForm } from '../../../../../components/ClosureForm'

export default function FacilitiesClosuresEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ClosureEditForm id={id} />
      </PageBody>
    </Page>
  )
}
