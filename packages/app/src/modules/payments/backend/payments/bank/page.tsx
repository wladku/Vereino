import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BankStatementPage } from '../../../components/bank/BankStatementPage'

export default function PaymentsBankPage() {
  return (
    <Page>
      <PageBody>
        <BankStatementPage />
      </PageBody>
    </Page>
  )
}
