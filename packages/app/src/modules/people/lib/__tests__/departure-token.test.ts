import { describe, expect, it } from '@jest/globals'
import {
  DEPARTURE_PREVIEW_TTL_MS,
  canonicalJson,
  checkPreviewToken,
  issuePreviewToken,
  type PreviewBinding,
} from '../departure-token'

const LAST_DAY = '2026-11-30'

describe('the preview token (*Security → Tenant isolation*)', () => {
  const binding: PreviewBinding = {
    tenantId: 't',
    organizationId: 'o',
    actorUserId: 'u',
    personIds: ['b', 'a', 'a'],
    lastDay: LAST_DAY,
    content: { ends: [{ id: 'm1', action: 'end' }], blockers: [], note: undefined },
  }
  const now = Date.UTC(2026, 10, 18, 12)

  it('confirms the previewed departure within 15 minutes, whatever the order of the persons', () => {
    const token = issuePreviewToken(binding, now)
    expect(checkPreviewToken(token, { ...binding, personIds: ['a', 'b'] }, now + DEPARTURE_PREVIEW_TTL_MS)).toBe(
      'valid',
    )
  })

  it('is stale when the content, the actor or the scope changed', () => {
    const token = issuePreviewToken(binding, now)
    expect(checkPreviewToken(token, { ...binding, content: { ends: [] } }, now)).toBe('stale')
    expect(checkPreviewToken(token, { ...binding, actorUserId: 'v' }, now)).toBe('stale')
    expect(checkPreviewToken(token, { ...binding, organizationId: 'x' }, now)).toBe('stale')
  })

  it('expires after 15 minutes and refuses a malformed token', () => {
    const token = issuePreviewToken(binding, now)
    expect(checkPreviewToken(token, binding, now + DEPARTURE_PREVIEW_TTL_MS + 1)).toBe('expired')
    expect(checkPreviewToken('nope', binding, now)).toBe('malformed')
  })

  it('serializes keys in a fixed order and missing values as null', () => {
    expect(canonicalJson({ b: 1, a: [true, null], c: undefined })).toBe('{"a":[true,null],"b":1}')
    expect(canonicalJson(undefined)).toBe('null')
    expect(canonicalJson({ a: { d: 'x', c: 2 } })).toBe('{"a":{"c":2,"d":"x"}}')
  })
})
