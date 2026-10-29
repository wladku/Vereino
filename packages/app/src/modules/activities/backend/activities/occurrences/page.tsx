import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OccurrencesTable } from '../../../components/OccurrencesTable'

export default function ActivitiesOccurrencesPage() {
  return (
    <Page>
      <PageBody>
        <OccurrencesTable />
      </PageBody>
    </Page>
  )
}
