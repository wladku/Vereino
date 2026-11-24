import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import OffboardingBanner from './widget.client'

/**
 * The offboarding banner (many clubs spec phase 4, REQ-M06, *UI and Interaction Contracts*; E22-S06b, #676) on the
 * platform spot `backend:layout:top`: while the operator has recorded the club's notice, it tells the club
 * administrator (`club_core.manage`) the deletion date and lets them export the club data and download the archive.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'club_core.injection.offboarding-banner',
    title: 'Club offboarding banner',
    description: 'Shows the deletion date of a club that is leaving and its data export.',
    features: ['club_core.manage'],
    priority: 120,
    enabled: true,
  },
  Widget: OffboardingBanner,
}

export default widget
