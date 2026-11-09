import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RequestsQueue } from '../../../components/RequestsQueue'

export default function FacilitiesRequestsPage() {
  return (
    <Page>
      <PageBody>
        <RequestsQueue />
      </PageBody>
    </Page>
  )
}
