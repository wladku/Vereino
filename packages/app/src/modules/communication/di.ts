import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { registerEmailTemplate } from '@/modules/foundation'
import { announcementTemplate, replyTemplate, sessionCancelledTemplate } from './emails/templates'
import notificationTypes from './notifications'

/**
 * The e-mail templates of `communication` (foundation III P-31): `communication.announcement`, `communication.reply`
 * and `communication.session_cancelled` under `vereino.emailTemplate.<id>`, read by the foundation's dispatch worker.
 * Registered for every request and job container, so the worker process finds them too.
 *
 * The in-app types of `notifications.ts` are also added to the platform's type registry here: the platform fills that
 * registry only in the web runtime, so the dispatch worker's `getNotificationType` would not find
 * `communication.announcement` in the queue worker process (the in-app deliveries would fail `render_failed`). The
 * registry is a map keyed by the type id, so repeating the registration is harmless.
 */
export function register(container: AppContainer) {
  registerNotificationTypes(notificationTypes)
  registerEmailTemplate(container, announcementTemplate)
  registerEmailTemplate(container, replyTemplate)
  registerEmailTemplate(container, sessionCancelledTemplate)
}
