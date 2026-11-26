import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BackendApplicationPage } from '../../../../components/backend/BackendApplicationPage'

export default function EnrolmentBackendApplicationPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <BackendApplicationPage id={id} />
      </PageBody>
    </Page>
  )
}
