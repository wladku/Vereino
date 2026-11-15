import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { InstitutionsTable } from '../../../components/InstitutionsTable'
import { ClubInstitutionsNav } from '../../../components/ClubInstitutionsNav'

export default function ClubInstitutionsPage() {
  return (
    <Page>
      <PageBody>
        <ClubInstitutionsNav current="institutions">
          <InstitutionsTable />
        </ClubInstitutionsNav>
      </PageBody>
    </Page>
  )
}
