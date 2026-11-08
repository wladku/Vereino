// Request schemas of `payments` (phase 4 steps 2 and 3, issues #108 and #109), shared by routes (OpenAPI) and commands. Public schemas
// never accept tenant or organization ids (`.strict()` rejects them). The cross-field rules — exactly one target of a
// fee, the value of a discount and its conditions — are checked in the commands against the merged record, so they
// answer coded 422s (`lib/error-codes.ts`) on create and on update alike.
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import {
  CHARGE_SOURCE_TYPES,
  COACH_FEE_ACCESS,
  DISCOUNT_KINDS,
  FEE_PERIODS,
  FULL_RATE_CHILDREN,
  MAX_AMOUNT,
  MAX_DUE_DAY,
  MIN_DUE_DAY,
  isBillingPeriod,
} from '../lib/payments-rules'
import {
  CHARGE_PERSPECTIVES,
  MANUAL_PAYMENT_METHODS,
  MAX_REASON_LENGTH,
  MAX_REFERENCE_LENGTH,
  PAYEES,
  PAYMENT_METHODS,
} from '../lib/charge-ledger'
import { MAX_CASH_CHARGES } from '../lib/cash'
import { BANK_FORMATS } from '../lib/bank-statement'
import { BANK_SKIP_REASONS, BANK_TRANSACTION_STATUSES, MAX_SKIP_NOTE_LENGTH } from '../lib/bank-matching'
import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_DESCRIPTION_MAX,
  CAMPAIGN_NAME_MAX,
  CAMPAIGN_NAME_MIN,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TEXT_MAX,
  MAX_CAMPAIGN_GROUPS,
  MAX_CAMPAIGN_PRODUCTS,
  MAX_PRODUCT_SIZES,
  PRODUCT_KINDS,
  PRODUCT_NAME_MAX,
  SIZE_MAX,
} from '../lib/order-campaigns'

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

const flagSchema = z.enum(['1', '0', 'true', 'false'])

/** True for a set query flag (`1` or `true`). */
export function flagSet(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export const chargeListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['dueDate', 'createdAt', 'updatedAt']).optional(),
  /** The `period_label`: `YYYY-MM` or `one_off`. */
  period: z.string().trim().max(20).optional(),
  payerMissing: flagSchema.optional(),
  personId: z.uuid().optional(),
  payerPersonId: z.uuid().optional(),
  /** One status or several, comma-separated. */
  status: z.string().trim().max(80).optional(),
  generationId: z.uuid().optional(),
  /** `open` or `partially_paid` past the due date in the club's calendar — a derived marker, not a status. */
  overdue: flagSchema.optional(),
  sourceType: z.enum(CHARGE_SOURCE_TYPES).optional(),
  payee: z.enum(PAYEES).optional(),
  /** Charges with a payment of this method that was not reversed (the "Cash payments" perspective). */
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  /** Informational: the B-21 perspective the client shows; the filters above do the work. */
  perspective: z.enum(CHARGE_PERSPECTIVES).optional(),
})

const reasonSchema = z.string().trim().min(1).max(MAX_REASON_LENGTH)

/** `payments.payments.record`: a cash or transfer payment of the charge `id` (the route's path parameter). */
export const paymentRecordSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().int().min(1).max(MAX_AMOUNT).describe('Grosz (minor units of PLN)'),
    method: z.enum(MANUAL_PAYMENT_METHODS),
    paidOn: calendarDateSchema.describe('The day the money arrived; not in the future'),
    reference: z.string().trim().max(MAX_REFERENCE_LENGTH).nullable().optional().describe('Transfer title or receipt'),
  })
  .strict()

/**
 * `payments.cash.record` ("Accept cash", REQ-031, #114): the payer, their selected open charges, the amount received
 * (at most what remains on them; a lower amount pays the oldest first), the day and whether the payer gets an e-mail.
 */
export const cashRecordSchema = z
  .object({
    payerPersonId: z.uuid(),
    chargeIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_CASH_CHARGES)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each charge may be selected once' }),
    amount: z.number().int().min(1).max(MAX_AMOUNT).describe('Grosz (minor units of PLN)'),
    paidOn: calendarDateSchema.describe('The day the cash was received; not in the future'),
    notify: z.boolean().default(true).describe('E-mail the payer a confirmation with the receipt number'),
  })
  .strict()

/** `GET /api/payments/cash/charges` and `/cash/payers`. */
export const cashChargesQuerySchema = z.object({ payerPersonId: z.uuid() })

export const cashPayersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

/** `payments.charges.cancel`: the charge `id` with a required reason. */
export const chargeCancelSchema = z.object({ id: z.uuid(), reason: reasonSchema }).strict()

/** `payments.payments.reverse`: the payment `id` with a required reason. */
export const paymentReverseSchema = z.object({ id: z.uuid(), reason: reasonSchema }).strict()

// --- Online checkout (#110, DD-42) ---

/** The most charges one checkout pays. */
export const MAX_CHECKOUT_CHARGES = 50

/** `POST /api/payments/checkout` (+ `/quote`): the open charges the payer selected. */
export const checkoutSchema = z
  .object({
    chargeIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_CHECKOUT_CHARGES)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Each charge once' }),
  })
  .strict()

/**
 * `payments.payments.refund`: the online payment `id`, the grosz to refund (all of what is not refunded yet when
 * omitted), a required reason and the operation id that makes a retry return the same refund (S10.4).
 */
export const paymentRefundSchema = z
  .object({
    id: z.uuid(),
    amount: z.number().int().min(1).max(MAX_AMOUNT).optional().describe('Grosz; the unrefunded part when omitted'),
    reason: reasonSchema,
    operationId: z.uuid().describe('The same id on a retry returns the same refund'),
  })
  .strict()

// --- Settings ---

export const paymentsSettingsUpdateSchema = z
  .object({
    coachFeeAccess: z.enum(COACH_FEE_ACCESS).optional(),
    autoBookBankMatches: z.boolean().optional(),
  })
  .strict()

// --- Order campaigns (#115, REQ-032, DD-30) ---

const sizesSchema = z
  .array(z.string().trim().min(1).max(SIZE_MAX))
  .max(MAX_PRODUCT_SIZES)
  .refine((sizes) => new Set(sizes).size === sizes.length, { message: 'payments.orders.validation.sizesUnique' })
  .default([])

/**
 * A product of the campaign form. `key` ties a set to its products (`componentKeys`); for a stored product it is its
 * id, and `id` names the product an update changes (a product the update no longer sends is removed).
 */
export const orderProductInputSchema = z
  .object({
    id: z.uuid().optional(),
    key: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX),
    kind: z.enum(PRODUCT_KINDS).default('item'),
    componentKeys: z.array(z.string().trim().min(1).max(60)).max(MAX_CAMPAIGN_PRODUCTS).default([]),
    sizesChild: sizesSchema,
    sizesAdult: sizesSchema,
    priceChild: z.number().int().min(0).max(MAX_AMOUNT).describe('Grosz; for a set, the set price'),
    priceAdult: z.number().int().min(0).max(MAX_AMOUNT).nullable().optional().describe('Grosz, for adult sizes'),
    requiredAnswer: z.boolean().default(false),
  })
  .strict()

const campaignFields = {
  name: z.string().trim().min(CAMPAIGN_NAME_MIN).max(CAMPAIGN_NAME_MAX),
  description: z.string().trim().max(CAMPAIGN_DESCRIPTION_MAX).nullable().optional(),
  sectionId: z.uuid(),
  groupIds: z
    .array(z.uuid())
    .min(1, { message: 'payments.orders.validation.groupsRequired' })
    .max(MAX_CAMPAIGN_GROUPS)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'payments.orders.validation.groupsRequired' }),
  closesOn: calendarDateSchema.describe('The orders deadline; not before today'),
  paymentDueOn: calendarDateSchema.describe('The payment deadline; not before the orders deadline'),
  askPrintName: z.boolean().default(false),
  askPrintNumber: z.boolean().default(false),
  notesLabel: z.string().trim().max(CAMPAIGN_TEXT_MAX).nullable().optional(),
  supplierName: z.string().trim().max(CAMPAIGN_TEXT_MAX).nullable().optional(),
  products: z.array(orderProductInputSchema).min(1).max(MAX_CAMPAIGN_PRODUCTS),
}

/** `payments.order_campaigns.create`: the form; `open` also opens collection ("Save and open collection"). */
export const orderCampaignCreateSchema = z.object({ ...campaignFields, open: z.boolean().default(false) }).strict()

/** `payments.order_campaigns.update`: the whole form again (products nested), in `draft` or `open` only. */
export const orderCampaignUpdateSchema = z
  .object({ id: z.uuid(), ...campaignFields, open: z.boolean().default(false) })
  .strict()

export const orderCampaignListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'closesOn', 'createdAt', 'updatedAt']).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  sectionId: z.uuid().optional(),
})

/** `payments.order_campaigns.transition`: the campaign `id` and the action of the route. */
export const orderCampaignTransitionSchema = z.object({ id: z.uuid(), action: z.enum(CAMPAIGN_ACTIONS) }).strict()

/** `payments.order_campaigns.remind`: e-mail the guardians of children without an order (optionally one group). */
export const orderCampaignRemindSchema = z.object({ id: z.uuid(), groupId: z.uuid().optional() }).strict()

export const orderCampaignSummaryQuerySchema = z.object({ format: z.enum(['json', 'csv']).default('json') })

export const ordersListQuerySchema = z.object({
  campaignId: z.uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

// --- Bank statement import (#113, REQ-030) ---

const columnNameSchema = z.string().trim().min(1).max(100)

/** The treasurer's CSV column mapping: the header text of each column in the bank's file. */
export const columnProfileSchema = z
  .object({
    date: columnNameSchema.optional(),
    amount: columnNameSchema.optional(),
    sender: columnNameSchema.optional(),
    title: columnNameSchema.optional(),
    account: columnNameSchema.optional(),
  })
  .strict()

/** `payments.bank_imports.create`: the text fields next to the file (the format is detected when omitted). */
export const bankImportCreateSchema = z
  .object({
    format: z
      .enum(BANK_FORMATS)
      .nullable()
      .optional()
      .describe('`csv` or `mt940`; detected from the content when omitted'),
    columnProfile: columnProfileSchema.nullable().optional(),
  })
  .strict()

export const bankImportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const bankTransactionListQuerySchema = z.object({
  status: z.enum(BANK_TRANSACTION_STATUSES).optional(),
  importId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

/** Confirm, Restore and Undo of the transfer `id` (the route's path parameter). */
export const bankTransactionActionSchema = z.object({ id: z.uuid() }).strict()

/** Assign (or change) the payer of the transfer `id`; it is recorded against their open charges, oldest first. */
export const bankTransactionAssignSchema = z.object({ id: z.uuid(), payerPersonId: z.uuid() }).strict()

/** Skip the transfer `id` with its reason (a donation, a grant, a refund, other) and an optional note. */
export const bankTransactionIgnoreSchema = z
  .object({
    id: z.uuid(),
    reason: z.enum(BANK_SKIP_REASONS),
    note: z.string().trim().max(MAX_SKIP_NOTE_LENGTH).nullable().optional(),
  })
  .strict()
