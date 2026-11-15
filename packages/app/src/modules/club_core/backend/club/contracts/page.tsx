import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ContractsTable } from '../../../components/ContractsTable'
import { ClubInstitutionsNav } from '../../../components/ClubInstitutionsNav'

export default function ClubContractsPage() {
  return (
    <Page>
      <PageBody>
        <ClubInstitutionsNav current="contracts">
          <ContractsTable />
        </ClubInstitutionsNav>
      </PageBody>
    </Page>
  )
}
