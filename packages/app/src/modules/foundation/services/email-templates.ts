// P-31 e-mail templates (foundation III REQ-M04, DD-M08): a module declares each e-mail once with typed params and an
// opt-out class and registers it under `vereino.emailTemplate.<id>`; the dispatch worker renders it per recipient, in
// the recipient's language (P-16 `renderLocalized`), inside the shared `EmailLayout`. Club-entered text goes in as
// params and is rendered as text with `clubText` (escaped, paragraph breaks kept; R09).
import * as React from 'react'
import { asValue } from 'awilix'
import type { AwilixContainer } from 'awilix'
import type { z } from 'zod'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import type { AudienceReason } from '@vereino/core'
import { emailTemplateProblem, emailTemplateToken, textParagraphs, type EmailOptOutClass } from '../lib/email-templates'

/** What a template sees besides its params while it renders for one recipient. */
export type EmailRenderContext = {
  locale: Locale
  clubName: string
  /** The app's public URL (`APP_URL`), without a trailing slash. */
  appUrl: string
  reasons: readonly AudienceReason[]
  /** The recipient's secret params (a raw link token, DD-M04); empty when the dispatch has none. */
  secrets: Readonly<Record<string, unknown>>
}

/**
 * An e-mail declared once (P-31). `t` is the recipient's dictionary. `body` returns plain elements or plain function
 * components without hooks (the worker expands the tree, see `expandEmailTree`); `text` is the plain-text alternative.
 * `link` (relative to `APP_URL` or absolute) becomes the layout's primary button, labelled by `actionLabel` or the
 * generic "Open in Vereino". `notificationType` is the in-app type the same dispatch uses (declared `channels:
 * ['in_app']`, DD-M07).
 */
export type EmailTemplate<TParams = Record<string, unknown>> = {
  id: string
  notificationType: string
  optOut: EmailOptOutClass
  params: z.ZodType<TParams>
  subject(t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext): string
  body(t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext): React.ReactElement
  text(t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext): string
  preheader?(t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext): string
  link?(params: TParams, ctx: EmailRenderContext): string | null
  actionLabel?(t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext): string
}

/** Validates the declaration (id, notification type, opt-out class) and returns it unchanged. */
export function defineEmailTemplate<TParams>(template: EmailTemplate<TParams>): EmailTemplate<TParams> {
  const problem = emailTemplateProblem(template)
  if (problem) throw new Error(`[internal] e-mail template ${template.id}: ${problem}`)
  return template
}

/** Registers a template in a module's `di.ts` (`register(container)`), under `vereino.emailTemplate.<id>`. */
export function registerEmailTemplate<TParams>(container: AwilixContainer, template: EmailTemplate<TParams>): void {
  container.register({ [emailTemplateToken(template.id)]: asValue(defineEmailTemplate(template)) })
}

/** The registered template, or null when no module registered the id. */
export function resolveEmailTemplate(container: AwilixContainer, id: string): EmailTemplate | null {
  const token = emailTemplateToken(id)
  return container.hasRegistration(token) ? container.resolve<EmailTemplate>(token) : null
}

/** Club-entered text as escaped paragraphs with its line breaks (R09): markup in the text shows as text. */
export function clubText(text: string): React.ReactElement {
  return React.createElement(
    React.Fragment,
    null,
    ...textParagraphs(text).map((lines, index) =>
      React.createElement(
        'p',
        { key: `p${String(index)}`, style: { margin: '0 0 12px' } },
        ...lines.flatMap((line, lineIndex) =>
          lineIndex === 0 ? [line] : [React.createElement('br', { key: `br${String(lineIndex)}` }), line],
        ),
      ),
    ),
  )
}
