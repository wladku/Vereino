import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ChargesTable } from '../../../components/ChargesTable'

export default function PaymentsChargesPage() {
  return (
    <Page>
      <PageBody>
        <ChargesTable />
      </PageBody>
    </Page>
  )
}
