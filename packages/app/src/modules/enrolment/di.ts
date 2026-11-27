import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { declareClubJobs, registerClubDataContributor, registerEmailTemplate } from '@/modules/foundation'
import { ENROLMENT_EMAIL_TEMPLATES } from './emails/templates'
import { ENROLMENT_CLUB_JOBS } from './lib/club-jobs'
import { ENROLMENT_CLUB_TABLES } from './lib/club-tables'
import notificationTypes from './notifications'
import {
  ENROLMENT_APPLICATION_LINKS,
  ENROLMENT_CONFIRMATION_LINKS,
  createApplicationLinks,
  createConfirmationLinks,
} from './services/links'
import {
  ENROLMENT_DATA_EXPORT_CONTRIBUTOR,
  ENROLMENT_DEPARTURE_CONTRIBUTOR,
  createDataExportContribution,
  departureContribution,
} from './services/people-contribution'

/**
 * `enrolment` (sign-up form spec phase 2, #799): the two token-link services of its dedicated link tables
 * (`enrolment.confirmationLinks`, DD-J06; `enrolment.applicationLinks`, DD-J07) — each lookup scoped to the club of the
 * route's slug; the applicant e-mails (registered for every request and job container, so the dispatch worker finds
 * them) and the in-app type of a new application (also here, because the worker runtime does not load the platform
 * registry); the per-club jobs (DD-J14) and the club offboarding contributor of its three tables. Phase 3 (#800): the
 * person data export contributor `people.dataExport.enrolment` and the departure contributor `people.departure.enrolment`
 * (erasure of the applications that became the person), both read by `people` with `hasRegistration`.
 */
const confirmationLinks = createConfirmationLinks()
const applicationLinks = createApplicationLinks()

export function register(container: AppContainer) {
  declareClubJobs(ENROLMENT_CLUB_JOBS)
  registerClubDataContributor(container, 'enrolment', ENROLMENT_CLUB_TABLES)
  registerNotificationTypes(notificationTypes)
  for (const template of ENROLMENT_EMAIL_TEMPLATES) registerEmailTemplate(container, template)
  container.register({
    [ENROLMENT_CONFIRMATION_LINKS]: asValue(confirmationLinks),
    [ENROLMENT_APPLICATION_LINKS]: asValue(applicationLinks),
    [ENROLMENT_DATA_EXPORT_CONTRIBUTOR]: asFunction(() => createDataExportContribution(container)).scoped(),
    [ENROLMENT_DEPARTURE_CONTRIBUTOR]: asValue(departureContribution),
  })
}
