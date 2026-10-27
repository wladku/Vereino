import { describe, expect, it } from '@jest/globals'
import { z } from 'zod'
import { calendarDateSchema, codedIssueErrorCode, refineValidity, validityShape } from '../validity-schema'

const assignmentSchema = z.object({ role: z.string(), ...validityShape }).superRefine(refineValidity)

describe('validity schema', () => {
  it('accepts open-ended and closed periods', () => {
    expect(assignmentSchema.parse({ role: 'coach', validFrom: '2026-09-01' })).toEqual({
      role: 'coach',
      validFrom: '2026-09-01',
    })
    expect(assignmentSchema.parse({ role: 'coach', validFrom: '2026-09-01', validTo: null }).validTo).toBeNull()
    expect(assignmentSchema.parse({ role: 'coach', validFrom: '2026-09-01', validTo: '2026-09-01' }).validTo).toBe(
      '2026-09-01',
    )
  })

  it('codes an inverted period as validity_inverted on validTo', () => {
    const result = assignmentSchema.safeParse({ role: 'coach', validFrom: '2026-09-02', validTo: '2026-09-01' })
    expect(result.success).toBe(false)
    const issues = result.error?.issues ?? []
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toEqual(['validTo'])
    expect(codedIssueErrorCode(issues)).toBe('validity_inverted')
  })

  it('rejects malformed dates without a coded issue', () => {
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false)
    const result = assignmentSchema.safeParse({ role: 'coach', validFrom: '2026-09-01', validTo: 'tomorrow' })
    expect(result.success).toBe(false)
    expect(codedIssueErrorCode(result.error?.issues ?? [])).toBeNull()
  })

  it('reads the first string error code from issue params', () => {
    expect(codedIssueErrorCode([])).toBeNull()
    expect(codedIssueErrorCode([{}, { params: { errorCode: 7 } }, { params: { errorCode: 'scope_denied' } }])).toBe(
      'scope_denied',
    )
  })
})
