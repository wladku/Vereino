import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import SessionOutlineWidget, { type SessionOutlineContext } from './widget.client'

/**
 * The "Outline" card of a session page (training outlines spec M-O6, REQ-O07, REQ-O08; #683), on the spot
 * `vereino:club:occurrence:sections` of `activities`' `/club/occurrences/[id]`, for staff who write outlines.
 */
const widget: InjectionWidgetModule<SessionOutlineContext, Record<string, unknown>> = {
  metadata: {
    id: 'training.injection.session-outline',
    title: 'Session outline',
    description: 'The training outline of the session: add one, read it while running the session, edit it, print it.',
    features: ['training.outlines.write'],
    priority: 100,
    enabled: true,
  },
  Widget: SessionOutlineWidget,
}

export default widget
