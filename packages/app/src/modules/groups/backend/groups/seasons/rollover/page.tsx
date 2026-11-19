import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { SeasonRolloverWizard } from '../../../../components/SeasonRolloverWizard'

export default function GroupsSeasonRolloverPage() {
  return (
    <Page>
      <PageBody>
        <SeasonRolloverWizard />
      </PageBody>
    </Page>
  )
}
