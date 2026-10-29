import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PersonRecord } from '../../../../components/PersonRecord'

export default function PeoplePersonRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <PersonRecord id={id} />
      </PageBody>
    </Page>
  )
}
