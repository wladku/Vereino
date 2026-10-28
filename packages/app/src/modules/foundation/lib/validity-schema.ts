// Zod side of P-06 Validity: module schemas compose `validityShape` and `refineValidity`, and `authorizeScoped`
// turns the coded issue into the 422 `validity_inverted` error (`@vereino/core` itself has no Zod dependency).
import { z } from 'zod'
import { isCalendarDate, isInvertedPeriod } from '@vereino/core'
import type { FoundationErrorCode } from './error-codes'

/** A `YYYY-MM-DD` calendar date. */
export const calendarDateSchema = z.string().refine(isCalendarDate, { message: 'Expected a YYYY-MM-DD date' })

/** `validFrom` (required) and `validTo` (optional, null = open-ended), to spread into a module's object schema. */
export const validityShape = {
  validFrom: calendarDateSchema,
  validTo: calendarDateSchema.nullable().optional(),
}

/** Issue params that carry an error code of a module table through a Zod refine. */
export type CodedIssueParams = { errorCode: FoundationErrorCode }

/** `superRefine` callback: a `validTo` before `validFrom` adds a custom issue coded `validity_inverted`. */
export function refineValidity(value: { validFrom: string; validTo?: string | null }, ctx: z.RefinementCtx): void {
  if (!isInvertedPeriod(value.validFrom, value.validTo)) return
  const params: CodedIssueParams = { errorCode: 'validity_inverted' }
  ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'validity_inverted', params })
}

/** The first error code carried by the issues' params (Zod issues of any kind), or null. */
export function codedIssueErrorCode(issues: readonly object[]): string | null {
  for (const issue of issues) {
    const { params } = issue as { params?: { errorCode?: unknown } }
    const code = params?.errorCode
    if (typeof code === 'string') return code
  }
  return null
}
