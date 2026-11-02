import { describe, expect, it } from '@jest/globals'
import {
  EMAIL_OPT_OUT_CLASSES,
  absoluteLink,
  EMAIL_TEMPLATE_TOKEN_PREFIX,
  emailTemplateProblem,
  emailTemplateToken,
  isOptOutAvailable,
  textParagraphs,
} from '../email-templates'

describe('e-mail template rules', () => {
  it('names the token and the opt-out classes', () => {
    expect(EMAIL_TEMPLATE_TOKEN_PREFIX).toBe('vereino.emailTemplate.')
    expect(emailTemplateToken('communication.announcement')).toBe('vereino.emailTemplate.communication.announcement')
    expect(EMAIL_OPT_OUT_CLASSES).toEqual(['never', 'preferences'])
  })

  it('accepts a well-formed declaration and names the problem of a malformed one', () => {
    const valid = { id: 'communication.announcement', notificationType: 'communication.announcement', optOut: 'never' }
    expect(emailTemplateProblem(valid)).toBeNull()
    expect(emailTemplateProblem({ ...valid, id: 'Announcement' })).toMatch(/id/)
    expect(emailTemplateProblem({ ...valid, id: 7 })).toMatch(/id/)
    expect(emailTemplateProblem({ ...valid, notificationType: null })).toMatch(/notification type/)
    expect(emailTemplateProblem({ ...valid, notificationType: 'x' })).toMatch(/notification type/)
    expect(emailTemplateProblem({ ...valid, optOut: 'sometimes' })).toMatch(/opt-out/)
  })

  it('refuses the preferences class until its opt-out exists (Q15 = B)', () => {
    expect(isOptOutAvailable('never')).toBe(true)
    expect(isOptOutAvailable('preferences')).toBe(false)
  })

  it('splits club text into paragraphs of lines and keeps markup as text', () => {
    expect(textParagraphs('Mecz o <b>11:00</b>.\r\nZbiórka 10:15.\n \nDo zobaczenia!\n\n\n')).toEqual([
      ['Mecz o <b>11:00</b>.', 'Zbiórka 10:15.'],
      ['Do zobaczenia!'],
    ])
    expect(textParagraphs('')).toEqual([])
  })

  it('makes a template link absolute against the app URL', () => {
    expect(absoluteLink('https://app.example.test/', '/club/messages/1')).toBe(
      'https://app.example.test/club/messages/1',
    )
    expect(absoluteLink('https://app.example.test', 'p/club')).toBe('https://app.example.test/p/club')
    expect(absoluteLink('https://app.example.test', 'HTTPS://other.test/x')).toBe('HTTPS://other.test/x')
  })
})
