// The e-mail sender seam `foundation.emailSender` (foundation III P-30, DD-M17 → S12.6): the dispatch worker sends every
// e-mail through it. The default is the platform's `sendEmail` (which, under `OM_TEST_MODE`, appends the e-mail to the
// test capture instead of sending it); tests replace it to script failures, and a staging deployment can register an
// allowlist sender under the same token. `OM_DISABLE_EMAIL_DELIVERY` is read here, before the platform's `sendEmail`
// would return silently, so a disabled delivery is recorded as `skipped` / `delivery_disabled`, never as `sent` (DD-M09).
import type { AwilixContainer } from 'awilix'
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { sendEmail, type SendEmailOptions } from '@open-mercato/shared/lib/email/send'

/** DI token of the sender; registered by `di.ts` with the default, replaceable by tests and staging. */
export const EMAIL_SENDER_TOKEN = 'foundation.emailSender'

export type EmailSender = { send(options: SendEmailOptions): Promise<void> }

export const defaultEmailSender: EmailSender = { send: (options) => sendEmail(options) }

/** The registered sender, or the platform default when the container has none (a bare CLI container). */
export function emailSender(container: AwilixContainer): EmailSender {
  return container.hasRegistration(EMAIL_SENDER_TOKEN)
    ? container.resolve<EmailSender>(EMAIL_SENDER_TOKEN)
    : defaultEmailSender
}

/** True when the operator switched e-mail delivery off (`OM_DISABLE_EMAIL_DELIVERY`); test mode alone is not "off". */
export function isEmailDeliveryDisabled(): boolean {
  return parseBooleanWithDefault(process.env.OM_DISABLE_EMAIL_DELIVERY, false)
}
