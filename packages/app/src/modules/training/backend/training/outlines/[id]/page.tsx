import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OutlineEditForm } from '../../../../components/backend/OutlineEditForm'

export default function TrainingOutlineBackendPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <OutlineEditForm id={id} />
      </PageBody>
    </Page>
  )
}
