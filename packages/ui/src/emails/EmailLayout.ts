// P-31 `EmailLayout` (foundation III REQ-M04, DD-M16; *UI and Interaction Contracts* → E-mail): the one shell of every
// Vereino e-mail — the club's name, a hidden preheader, the template's body, a primary button when the template has a
// link, and a footer with the reason for the e-mail and, for `preferences` templates, the preferences link. Every
// string comes in through props already translated for the recipient; club text is passed as text, never as HTML.
// No images and no tracking. Inline styles are the only styling e-mail clients honour.
//
// Written with `createElement` in a `.ts` file, not as JSX: the dispatch worker runs in the platform's Node worker and
// CLI processes, which load `@vereino/*` sources with Node's type stripping, and Node cannot load `.tsx`.
import * as React from 'react'

export type EmailLink = { label: string; href: string }

export type EmailLayoutProps = {
  /** The recipient's language (`<div lang>`). */
  lang: string
  clubName: string
  /** The inbox preview line; hidden in the body. */
  preheader?: string | null
  /** Why the recipient gets the e-mail, e.g. "You receive this e-mail because you are the guardian of …". */
  reason: string
  /** Who sent it, e.g. "This message was sent by {club} through Vereino." */
  footer: string
  /** The primary button when the template has a link. */
  action?: EmailLink | null
  /** Only for `preferences` templates. */
  preferences?: EmailLink | null
  children?: React.ReactNode
}

const FRAME_STYLE = { backgroundColor: '#f4f4f5', padding: '24px 12px', fontFamily: 'Arial, Helvetica, sans-serif' }
const CARD_STYLE = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  border: '1px solid #e4e4e7',
  borderRadius: '8px',
  padding: '24px',
  color: '#18181b',
  fontSize: '16px',
  lineHeight: '1.5',
}
const CLUB_STYLE = { margin: '0 0 16px', fontSize: '14px', fontWeight: 'bold', color: '#3f3f46' }
const BUTTON_STYLE = {
  display: 'inline-block',
  backgroundColor: '#18181b',
  color: '#ffffff',
  padding: '12px 20px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 'bold',
}
const FOOTER_STYLE = { margin: '24px auto 0', maxWidth: '600px', fontSize: '12px', lineHeight: '1.5', color: '#52525b' }
const PREHEADER_STYLE = { display: 'none', maxHeight: 0, overflow: 'hidden' }

/**
 * A plain function component without hooks, so the dispatch worker can expand it into plain elements
 * (`expandEmailTree`) before the platform's test capture reads the tree.
 */
export function EmailLayout({
  lang,
  clubName,
  preheader,
  reason,
  footer,
  action,
  preferences,
  children,
}: EmailLayoutProps): React.ReactElement {
  const h = React.createElement
  return h(
    'div',
    { lang, style: FRAME_STYLE },
    preheader ? h('div', { style: PREHEADER_STYLE }, preheader) : null,
    h(
      'div',
      { style: CARD_STYLE },
      h('p', { style: CLUB_STYLE, 'data-email-part': 'club' }, clubName),
      h('div', { 'data-email-part': 'body' }, children),
      action
        ? h(
            'p',
            { style: { margin: '24px 0 0' } },
            h('a', { href: action.href, style: BUTTON_STYLE, 'data-email-part': 'action' }, action.label),
          )
        : null,
    ),
    h(
      'div',
      { style: FOOTER_STYLE, 'data-email-part': 'footer' },
      h('p', { style: { margin: '0 0 4px' } }, reason),
      h('p', { style: { margin: 0 } }, footer),
      preferences
        ? h(
            'p',
            { style: { margin: '4px 0 0' } },
            h('a', { href: preferences.href, style: { color: '#52525b' } }, preferences.label),
          )
        : null,
    ),
  )
}

/** The plain-text alternative of the same e-mail: the club, the body text, the link and the footer. */
export function emailLayoutText(
  props: Pick<EmailLayoutProps, 'clubName' | 'reason' | 'footer' | 'action' | 'preferences'>,
  bodyText: string,
): string {
  const parts = [props.clubName, bodyText.trim()]
  if (props.action) parts.push(`${props.action.label}: ${props.action.href}`)
  parts.push(`--\n${props.reason}\n${props.footer}`)
  if (props.preferences) parts.push(`${props.preferences.label}: ${props.preferences.href}`)
  return parts.join('\n\n')
}
