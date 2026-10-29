import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { GroupRecord } from '../../../../components/GroupRecord'

export default function GroupsGroupRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <GroupRecord id={id} />
      </PageBody>
    </Page>
  )
}
