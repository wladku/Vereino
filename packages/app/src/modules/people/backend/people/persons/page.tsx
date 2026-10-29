import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PersonsTable } from '../../../components/PersonsTable'

export default function PeoplePersonsPage() {
  return (
    <Page>
      <PageBody>
        <PersonsTable />
      </PageBody>
    </Page>
  )
}
