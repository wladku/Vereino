import { describe, expect, it } from '@jest/globals'
import { CASE_MANAGE_KINDS, mayDeleteMessage, mayMarkCase, messageChangeRefusal } from '../case-rules'
import { errorCodes } from '../error-codes'

describe('marking a case (DD-M11)', () => {
  it('lets the section coordinator and the administrator mark, least-privileged first', () => {
    expect(CASE_MANAGE_KINDS).toEqual(['coordinator', 'club_admin'])
  })

  it('offers the marking only on a thread that is not a case, to staff with the feature', () => {
    expect(mayMarkCase({ isCase: false, staffRole: 'coordinator', hasCaseFeature: true })).toBe(true)
    expect(mayMarkCase({ isCase: false, staffRole: 'club_admin', hasCaseFeature: true })).toBe(true)
    expect(mayMarkCase({ isCase: true, staffRole: 'club_admin', hasCaseFeature: true })).toBe(false)
    expect(mayMarkCase({ isCase: false, staffRole: null, hasCaseFeature: true })).toBe(false)
    expect(mayMarkCase({ isCase: false, staffRole: 'coordinator', hasCaseFeature: false })).toBe(false)
  })
})

describe('changing a message (REQ-M09, AC-010)', () => {
  it('refuses every change of a case message first', () => {
    expect(messageChangeRefusal({ threadIsCase: true, system: false, deleted: false })).toBe('case_immutable')
    expect(messageChangeRefusal({ threadIsCase: true, system: true, deleted: false })).toBe('case_immutable')
    expect(messageChangeRefusal({ threadIsCase: true, system: false, deleted: true })).toBe('case_immutable')
  })

  it('then refuses a system message and an already deleted one', () => {
    expect(messageChangeRefusal({ threadIsCase: false, system: true, deleted: true })).toBe('message_not_editable')
    expect(messageChangeRefusal({ threadIsCase: false, system: false, deleted: true })).toBe('message_deleted')
  })

  it('allows a change otherwise', () => {
    expect(messageChangeRefusal({ threadIsCase: false, system: false, deleted: false })).toBeNull()
  })

  it('answers every refusal with a declared 409 code', () => {
    const declared = new Map<string, number>(errorCodes.map((entry) => [entry.code, entry.status]))
    for (const code of ['case_immutable', 'case_already_open', 'message_not_editable', 'message_deleted']) {
      expect(declared.get(code)).toBe(409)
    }
  })
})

describe('offering "Delete message" (B-19, DD-M10)', () => {
  const open = { threadIsCase: false, system: false, deleted: false }

  it('offers it to the author and to staff on a thread that is not a case', () => {
    expect(mayDeleteMessage({ ...open, own: true, staffRole: null })).toBe(true)
    expect(mayDeleteMessage({ ...open, own: false, staffRole: 'coordinator' })).toBe(true)
    expect(mayDeleteMessage({ ...open, own: false, staffRole: 'club_admin' })).toBe(true)
  })

  it('never offers it to anyone else', () => {
    expect(mayDeleteMessage({ ...open, own: false, staffRole: null })).toBe(false)
  })

  it('never offers it on a case, a system message or a deleted message', () => {
    expect(mayDeleteMessage({ ...open, threadIsCase: true, own: true, staffRole: 'club_admin' })).toBe(false)
    expect(mayDeleteMessage({ ...open, system: true, own: false, staffRole: 'club_admin' })).toBe(false)
    expect(mayDeleteMessage({ ...open, deleted: true, own: true, staffRole: null })).toBe(false)
  })
})
