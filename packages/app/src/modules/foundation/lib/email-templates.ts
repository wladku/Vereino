// P-31 e-mail template rules (foundation III REQ-M04, DD-M08): template ids and DI tokens, the opt-out classes, and the
// paragraph split that inserts club-entered text as written (R09). Pure; `services/email-templates.ts` renders.

/** `never`: always sent (every phase 3 template). `preferences`: needs an opt-out mechanism, which does not exist yet. */
export const EMAIL_OPT_OUT_CLASSES = ['never', 'preferences'] as const
export type EmailOptOutClass = (typeof EMAIL_OPT_OUT_CLASSES)[number]

/** DI token prefix of registered templates: `vereino.emailTemplate.<id>`. */
export const EMAIL_TEMPLATE_TOKEN_PREFIX = 'vereino.emailTemplate.'

/** `<module>.<name>` in snake case, e.g. `communication.announcement`. */
const TEMPLATE_ID = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

export function emailTemplateToken(id: string): string {
  return `${EMAIL_TEMPLATE_TOKEN_PREFIX}${id}`
}

/** The problem with a template declaration, or null when it is well-formed. */
export function emailTemplateProblem(declaration: {
  id: unknown
  notificationType: unknown
  optOut: unknown
}): string | null {
  if (typeof declaration.id !== 'string' || !TEMPLATE_ID.test(declaration.id)) {
    return 'the id must be <module>.<name> in snake case'
  }
  if (typeof declaration.notificationType !== 'string' || !TEMPLATE_ID.test(declaration.notificationType)) {
    return 'the notification type must be <module>.<name> in snake case'
  }
  if (!(EMAIL_OPT_OUT_CLASSES as readonly unknown[]).includes(declaration.optOut)) {
    return `the opt-out class must be one of ${EMAIL_OPT_OUT_CLASSES.join(', ')}`
  }
  return null
}

/**
 * Until the first `preferences` template brings its opt-out (Q15 = B), dispatch refuses it (500, fingerprint
 * `foundation.dispatch.optout_unavailable`).
 */
export function isOptOutAvailable(optOut: EmailOptOutClass): boolean {
  return optOut === 'never'
}

/**
 * Club-entered text as paragraphs of lines (blank lines separate paragraphs, line breaks are kept), with the text
 * itself untouched: the renderer inserts each line as a text node, so markup shows as text (R09).
 */
export function textParagraphs(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.split('\n'))
    .filter((lines) => lines.some((line) => line.trim().length > 0))
}

/** A template's link made absolute against the app's public URL (`APP_URL`); an absolute link is kept. */
export function absoluteLink(baseUrl: string, link: string): string {
  if (/^https?:\/\//i.test(link)) return link
  return `${baseUrl.replace(/\/+$/, '')}/${link.replace(/^\/+/, '')}`
}
