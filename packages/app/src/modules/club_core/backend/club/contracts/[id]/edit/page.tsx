import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ContractEditForm } from '../../../../../components/ContractForm'

export default function ClubContractsEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ContractEditForm id={id} />
      </PageBody>
    </Page>
  )
}
