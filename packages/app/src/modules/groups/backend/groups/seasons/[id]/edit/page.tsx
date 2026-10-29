import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { SeasonEditForm } from '../../../../../components/SeasonForm'

export default function GroupsSeasonsEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <SeasonEditForm id={id} />
      </PageBody>
    </Page>
  )
}
