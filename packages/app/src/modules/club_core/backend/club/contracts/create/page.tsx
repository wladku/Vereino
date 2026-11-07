import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ContractCreateForm } from '../../../../components/ContractForm'

export default function ClubContractsCreatePage() {
  return (
    <Page>
      <PageBody>
        <ContractCreateForm />
      </PageBody>
    </Page>
  )
}
