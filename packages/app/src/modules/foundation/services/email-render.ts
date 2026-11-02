// Rendering of a P-31 template for one recipient (foundation III REQ-M04): the subject, the body inside `EmailLayout`
// from `@vereino/ui` and the plain-text alternative, in the recipient's language (P-16 `renderLocalized`). Only the
// dispatch worker imports this file, and it imports `@vereino/ui/emails` (plain `.ts` files the Node worker can load),
// never the package root with its `.tsx` member components.
import * as React from 'react'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import type { AudienceReason } from '@vereino/core'
import { EmailLayout, emailLayoutText, expandEmailTree } from '@vereino/ui/emails'
import { primaryReason } from '../lib/dispatch-rules'
import { absoluteLink } from '../lib/email-templates'
import type { EmailRenderContext, EmailTemplate } from './email-templates'
import { renderLocalized } from './localized'

/** The app's public URL for links in e-mails; production refuses to guess it (the render fails, nothing is sent). */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (env.NODE_ENV === 'production') throw new Error('[internal] APP_URL must be configured to link from e-mails')
  return 'http://localhost:3000'
}

export type RenderedEmail = { subject: string; react: React.ReactElement; text: string; locale: Locale }

/**
 * Renders a template for one recipient in their language: the subject, the body inside `EmailLayout` (expanded to
 * plain elements) and the plain-text alternative. Params are parsed with the template's schema again; any error is
 * the caller's `render_failed`.
 */
export async function renderEmail(
  template: EmailTemplate,
  rawParams: unknown,
  recipient: { locale: string; reasons: readonly AudienceReason[]; secrets: Readonly<Record<string, unknown>> },
  club: { name: string },
): Promise<RenderedEmail> {
  const params = template.params.parse(rawParams)
  const appUrl = appBaseUrl()
  return renderLocalized(recipient.locale, (t, locale) => {
    const ctx: EmailRenderContext = {
      locale,
      clubName: club.name,
      appUrl,
      reasons: recipient.reasons,
      secrets: recipient.secrets,
    }
    const reason = primaryReason(recipient.reasons)
    const link = template.link?.(params, ctx) ?? null
    const action = link
      ? {
          label: template.actionLabel?.(t, params, ctx) ?? t('foundation.email.action', 'Open in Vereino'),
          href: absoluteLink(appUrl, link),
        }
      : null
    const chrome = {
      clubName: club.name,
      reason: t(`foundation.email.reason.${reason}`, 'You receive this e-mail from {club}.', { club: club.name }),
      footer: t('foundation.email.footer', 'This message was sent by {club} through Vereino.', { club: club.name }),
      action,
      // A `preferences` template is refused before it renders (Q15 = B); its opt-out link arrives with REQ-017.
      preferences: null,
    }
    const layout = React.createElement(
      EmailLayout,
      { ...chrome, lang: locale, preheader: template.preheader?.(t, params, ctx) ?? null },
      template.body(t, params, ctx),
    )
    return {
      subject: template.subject(t, params, ctx),
      react: expandEmailTree(layout) as React.ReactElement,
      text: emailLayoutText(chrome, template.text(t, params, ctx)),
      locale,
    }
  })
}
