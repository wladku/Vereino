// The applicant's e-mails and the deciders' in-app notice (sign-up form spec DD-J13, *Events, Jobs, Notifications*;
// #799): an e-mail is enqueued in the transaction of the command that decides it (a rolled-back command sends nothing),
// with an idempotency key `enrolment:<applicationId>:<event>` so a retry sends one, and published after the commit. A
// raw token travels only as the delivery's secret. The in-app notice names the section only.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { resolveSupportedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { bareAddressKey, type DispatchService } from '@/modules/foundation'
import notificationTypes from '../notifications'
import { deciderUserIds, type EnrolmentScope } from './directory'

const DISPATCH = 'foundationDispatch'

function dispatchService(container: AwilixContainer): DispatchService {
  return container.resolve<DispatchService>(DISPATCH)
}

/** The supported language of an applicant's e-mails: the form's, else the club's default. */
export function applicantLocale(requested: string | null | undefined, clubDefault: string): string {
  return resolveSupportedLocale(requested ?? undefined) ?? resolveSupportedLocale(clubDefault) ?? 'en'
}

export type ApplicantMail = {
  applicationId: string
  /** The template without its module prefix, e.g. `confirm_email`. */
  template: string
  /** The idempotency suffix: one e-mail per application and event. */
  event: string
  params: Record<string, unknown>
  email: string
  locale: string
  /** A raw link token for the button (never a param). */
  token?: string
}

/** Enqueues an applicant e-mail in `em`'s transaction; the dispatch id to publish after commit, or null when sent. */
export async function enqueueApplicantMail(
  container: AwilixContainer,
  em: EntityManager,
  scope: EnrolmentScope,
  mail: ApplicantMail,
): Promise<string | null> {
  const enqueued = await dispatchService(container).enqueue(
    em,
    {
      template: `enrolment.${mail.template}`,
      params: mail.params,
      addresses: [{ email: mail.email, locale: mail.locale }],
      ...(mail.token ? { secrets: new Map([[bareAddressKey(mail.email), { token: mail.token }]]) } : {}),
      source: { module: 'enrolment', type: 'enrolment:application', id: mail.applicationId },
      idempotencyKey: `enrolment:${mail.applicationId}:${mail.event}`,
      actor: { userId: null, actingRole: 'system' },
    },
    { ...scope, scope: [{ kind: 'system_job' }], em },
  )
  return enqueued.created ? enqueued.dispatchId : null
}

/** Publishes committed dispatches; a failure is left to the dispatch sweeper. */
export async function publishDispatches(
  container: AwilixContainer,
  scope: EnrolmentScope,
  dispatchIds: ReadonlyArray<string | null>,
): Promise<void> {
  for (const dispatchId of dispatchIds) {
    if (dispatchId) await dispatchService(container).publish(dispatchId, scope)
  }
}

/**
 * The in-app notice of a confirmed application to the deciders of its section (BR-J5, Q-J03): its coordinators, else
 * the club's administrators. The body names the section only.
 */
export async function notifyDeciders(
  container: AwilixContainer,
  scope: EnrolmentScope,
  input: { applicationId: string; sectionId: string; sectionName: string; today: string },
): Promise<number> {
  const type = notificationTypes.find((entry) => entry.type === 'enrolment.application_new')
  if (!type) return 0
  const userIds = await deciderUserIds(container, scope, input.sectionId, input.today)
  if (userIds.length === 0) return 0
  const notification = buildBatchNotificationFromType(type, {
    recipientUserIds: userIds,
    bodyVariables: { section: input.sectionName },
    sourceEntityType: 'enrolment:application',
    sourceEntityId: input.applicationId,
    groupKey: `enrolment:application:${input.applicationId}`,
  })
  await resolveNotificationService(container).createBatch(notification, scope)
  return userIds.length
}
