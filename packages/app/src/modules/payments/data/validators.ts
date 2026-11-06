// Request schemas of `payments` (phase 4 step 2, issue #108), shared by routes (OpenAPI) and commands. Public schemas
// never accept tenant or organization ids (`.strict()` rejects them). The cross-field rules — exactly one target of a
// fee, the value of a discount and its conditions — are checked in the commands against the merged record, so they
// answer coded 422s (`lib/error-codes.ts`) on create and on update alike.
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import {
  COACH_FEE_ACCESS,
  DISCOUNT_KINDS,
  FEE_PERIODS,
  FULL_RATE_CHILDREN,
  MAX_AMOUNT,
  MAX_DUE_DAY,
  MIN_DUE_DAY,
  isBillingPeriod,
} from '../lib/payments-rules'

const nameSchema = z.string().trim().min(1).max(200)
const amountSchema = z.number().int().min(1).max(MAX_AMOUNT).describe('Grosz (minor units of PLN)')
const dueDaySchema = z.number().int().min(MIN_DUE_DAY).max(MAX_DUE_DAY)

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  search: z.string().trim().min(1).max(200).optional(),
}

export const billingPeriodSchema = z.string().refine(isBillingPeriod, { message: 'Expected a YYYY-MM period' })

// --- Fees ---

export const feeCreateSchema = z
  .object({
    name: nameSchema,
    amount: amountSchema,
    period: z.enum(FEE_PERIODS),
    groupId: z.uuid().nullable().optional(),
    activityId: z.uuid().nullable().optional(),
    dueDay: dueDaySchema,
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const feeUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    amount: amountSchema.optional(),
    period: z.enum(FEE_PERIODS).optional(),
    groupId: z.uuid().nullable().optional(),
    activityId: z.uuid().nullable().optional(),
    dueDay: dueDaySchema.optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

export const feeDeleteSchema = z.object({ id: z.uuid() }).strict()

export const feeListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'amount', 'validFrom', 'createdAt', 'updatedAt']).optional(),
  period: z.enum(FEE_PERIODS).optional(),
  groupId: z.uuid().optional(),
  activityId: z.uuid().optional(),
})

// --- Discount rules ---

export const discountConditionsSchema = z
  .object({
    feePeriods: z.array(z.enum(FEE_PERIODS)).max(FEE_PERIODS.length).optional(),
    fullRate: z.enum(FULL_RATE_CHILDREN).optional(),
    personIds: z.array(z.uuid()).max(500).optional(),
  })
  .strict()

export const discountRuleCreateSchema = z
  .object({
    name: nameSchema,
    kind: z.enum(DISCOUNT_KINDS),
    percent: z.number().nullable().optional().describe('Whole percent 1–100'),
    amount: z.number().nullable().optional().describe('Grosz'),
    conditions: discountConditionsSchema.optional(),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const discountRuleUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    percent: z.number().nullable().optional(),
    amount: z.number().nullable().optional(),
    conditions: discountConditionsSchema.optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

export const discountRuleDeleteSchema = z.object({ id: z.uuid() }).strict()

export const discountRuleListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'kind', 'validFrom', 'createdAt', 'updatedAt']).optional(),
  kind: z.enum(DISCOUNT_KINDS).optional(),
})

// --- Charges ---

export const chargeGenerateSchema = z.object({ period: billingPeriodSchema }).strict()

export const chargeListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['dueDate', 'createdAt', 'updatedAt']).optional(),
  /** The `period_label`: `YYYY-MM` or `one_off`. */
  period: z.string().trim().max(20).optional(),
  payerMissing: z.enum(['1', '0', 'true', 'false']).optional(),
  personId: z.uuid().optional(),
  payerPersonId: z.uuid().optional(),
  status: z.string().trim().max(40).optional(),
  generationId: z.uuid().optional(),
})

// --- Settings ---

export const paymentsSettingsUpdateSchema = z
  .object({
    coachFeeAccess: z.enum(COACH_FEE_ACCESS).optional(),
    autoBookBankMatches: z.boolean().optional(),
  })
  .strict()
