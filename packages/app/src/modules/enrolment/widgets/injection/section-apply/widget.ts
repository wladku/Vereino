import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import SectionApplyWidget, { type SectionApplyContext } from './widget.client'

/**
 * P-J1 (sign-up form spec; #799): the "Apply" button of the public section page `/p/[clubSlug]/sections/[sectionSlug]`
 * on the spot `vereino:public:section:actions` of `club_core`, shown while the section takes applications. The page
 * is public: no features.
 */
const widget: InjectionWidgetModule<SectionApplyContext, Record<string, unknown>> = {
  metadata: {
    id: 'enrolment.injection.section-apply',
    title: 'Public section: apply',
    description: 'The button to the section sign-up form and the answer time.',
    priority: 100,
    enabled: true,
  },
  Widget: SectionApplyWidget,
}

export default widget
