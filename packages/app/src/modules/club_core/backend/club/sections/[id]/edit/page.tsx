import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { SectionEditForm } from '../../../../../components/SectionForm'

export default function ClubSectionsEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <SectionEditForm id={id} />
      </PageBody>
    </Page>
  )
}
