import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { FeesTable } from '../../../components/FeesTable'

export default function PaymentsFeesPage() {
  return (
    <Page>
      <PageBody>
        <FeesTable />
      </PageBody>
    </Page>
  )
}
