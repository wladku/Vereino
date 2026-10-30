import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ImportRecord } from '../../../../components/imports/ImportRecord'

export default function PeopleImportRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ImportRecord id={id} />
      </PageBody>
    </Page>
  )
}
