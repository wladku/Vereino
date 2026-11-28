import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import TrialParticipantsWidget, { type TrialParticipantsContext } from './widget.client'

/**
 * M-J4 "Trial participants" (sign-up form spec DD-J12, REQ-J16; #801) on the spot
 * `vereino:club:occurrence:attendance:extra` of `activities`' attendance page: the session's trial participants with
 * present / absent toggles, for a coach of the session (the route checks the scope; the card checks the feature itself,
 * since `/club` spots do not enforce it).
 */
const widget: InjectionWidgetModule<TrialParticipantsContext, Record<string, unknown>> = {
  metadata: {
    id: 'enrolment.injection.trial-participants',
    title: 'Session: trial participants',
    description: 'The trial participants of the session, with present and absent toggles for the coach.',
    features: ['enrolment.trials.mark'],
    priority: 100,
    enabled: true,
  },
  Widget: TrialParticipantsWidget,
}

export default widget
