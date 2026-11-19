import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ChargeGenerationsTable } from '../../../components/ChargeGenerationsTable'

export default function PaymentsGenerationsPage() {
  return (
    <Page>
      <PageBody>
        <ChargeGenerationsTable />
      </PageBody>
    </Page>
  )
}
