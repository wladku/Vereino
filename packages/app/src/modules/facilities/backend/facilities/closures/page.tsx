import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ClosuresTable } from '../../../components/ClosuresTable'
import { FacilityRulesNav } from '../../../components/FacilityRulesNav'

export default function FacilitiesClosuresPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRulesNav current="closures">
          <ClosuresTable />
        </FacilityRulesNav>
      </PageBody>
    </Page>
  )
}
