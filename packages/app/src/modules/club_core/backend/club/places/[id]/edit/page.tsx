import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PlaceEditForm } from '../../../../../components/PlaceForm'

export default function ClubPlacesEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <PlaceEditForm id={id} />
      </PageBody>
    </Page>
  )
}
