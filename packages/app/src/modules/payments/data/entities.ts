import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import {
  ScopedEntityBase,
  decorateScopedEntityBase,
  validFromColumn,
  validToColumn,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type {
  ChargeSourceType,
  ChargeStatus,
  CoachFeeAccess,
  DiscountConditions,
  DiscountKind,
  FeePeriod,
} from '../lib/payments-rules'
import type { PaymentMethod } from '../lib/charge-ledger'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A fee schedule (payments spec *Data Models* → `payments_fees`, REQ-011, REQ-018; B-20): a name, an amount in grosz,
 * a period, exactly one target — a `groups` group or an `activities` activity (scalar ids, no cross-module relation) —
 * the payment day 1–28 and a validity. Changing the amount does not change charges already issued.
 */
@Entity({ tableName: 'payments_fees' })
@Index({ name: 'payments_fees_org_group_idx', properties: ['organizationId', 'groupId'] })
@Index({ name: 'payments_fees_org_activity_idx', properties: ['organizationId', 'activityId'] })
@Index({ name: 'payments_fees_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Fee extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'groupId' | 'activityId' | 'validTo'

  @Property({ name: 'name', type: 'text' })
  name!: string

  /** Grosz (minor units of PLN). */
  @Property({ name: 'amount', type: 'int' })
  amount!: number

  @Property({ name: 'period', type: 'text' })
  period!: FeePeriod

  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

  @Property({ name: 'activity_id', type: 'uuid', nullable: true })
  activityId?: string | null

  /** The payment day of the month, 1–28. */
  @Property({ name: 'due_day', type: 'int' })
  dueDay!: number

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}

/**
 * A discount rule (payments spec *Data Models* → `payments_discount_rules`; R12, Q-006): `sibling` (a percent, the
 * full-rate child and the fee periods in `conditions`) or `custom` (a percent or an amount for the persons named in
 * `conditions`). When several rules match a charge, the most favorable one is stored on it.
 */
@Entity({ tableName: 'payments_discount_rules' })
@Index({ name: 'payments_discount_rules_org_kind_idx', properties: ['organizationId', 'kind'] })
@Index({ name: 'payments_discount_rules_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class DiscountRule extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'percent' | 'amount' | 'validTo'

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'kind', type: 'text' })
  kind!: DiscountKind

  /** Whole percent 1–100; exactly one of `percent` and `amount`. */
  @Property({ name: 'percent', type: 'int', nullable: true })
  percent?: number | null

  /** Grosz. */
  @Property({ name: 'amount', type: 'int', nullable: true })
  amount?: number | null

  @Property({ name: 'conditions', type: 'json' })
  conditions!: DiscountConditions

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}

/**
 * A charge — an amount to be paid (payments spec *Data Models* → `payments_charges`). Phase 4 step 2 creates `fee`
 * charges through the period generator: the debtor `person_id`, the payer (`payer_person_id`, or `payer_missing`), the
 * `period_label` (`YYYY-MM`, or `one_off`), the amount and the discount with the rule that granted it. The partial
 * unique index keeps one live charge per fee, person and period label, so a repeated generation creates nothing; a
 * cancelled charge leaves the index, so an undone generation can run again. `generation_id` names the run that created
 * the charge (its undo cancels the run's charges that are still open).
 */
@Entity({ tableName: 'payments_charges' })
@Index({ name: 'payments_charges_org_period_idx', properties: ['organizationId', 'periodLabel'] })
@Index({ name: 'payments_charges_org_person_idx', properties: ['organizationId', 'personId'] })
@Index({ name: 'payments_charges_org_payer_idx', properties: ['organizationId', 'payerPersonId'] })
@Index({ name: 'payments_charges_org_status_due_idx', properties: ['organizationId', 'status', 'dueDate'] })
@Index({ name: 'payments_charges_org_generation_idx', properties: ['organizationId', 'generationId'] })
@Index({ name: 'payments_charges_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'payments_charges_org_fee_person_period_unique',
  expression:
    'create unique index "payments_charges_org_fee_person_period_unique" on "payments_charges" ("organization_id", "source_id", "person_id", "period_label") where source_type = \'fee\' and status <> \'cancelled\' and deleted_at is null',
})
export class Charge extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'sourceId'
    | 'personId'
    | 'payerPersonId'
    | 'payerMissing'
    | 'periodLabel'
    | 'discountAmount'
    | 'discountRuleId'
    | 'payee'
    | 'status'
    | 'generationId'
    | 'cancelledAt'
    | 'cancelReason'

  @Property({ name: 'source_type', type: 'text' })
  sourceType!: ChargeSourceType

  /** The fee for `fee` charges. */
  @Property({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId?: string | null

  /** The debtor (a `people` person). */
  @Property({ name: 'person_id', type: 'uuid', nullable: true })
  personId?: string | null

  @Property({ name: 'payer_person_id', type: 'uuid', nullable: true })
  payerPersonId?: string | null

  @Property({ name: 'payer_missing', type: 'boolean', default: false })
  payerMissing: boolean = false

  /** `YYYY-MM` for monthly and per-session fees, `one_off` for one-off fees. */
  @Property({ name: 'period_label', type: 'text', nullable: true })
  periodLabel?: string | null

  @Property({ name: 'description', type: 'text' })
  description!: string

  /** Grosz, before the discount. */
  @Property({ name: 'amount', type: 'int' })
  amount!: number

  /** Grosz; the amount due is `amount − discount_amount`. */
  @Property({ name: 'discount_amount', type: 'int', default: 0 })
  discountAmount: number = 0

  @Property({ name: 'discount_rule_id', type: 'uuid', nullable: true })
  discountRuleId?: string | null

  @Property({ name: 'due_date', type: 'date' })
  dueDate!: string

  @Property({ name: 'payee', type: 'text', default: 'club' })
  payee: 'club' | 'owner_institution' = 'club'

  @Property({ name: 'status', type: 'text', default: 'open' })
  status: ChargeStatus = 'open'

  @Property({ name: 'generation_id', type: 'uuid', nullable: true })
  generationId?: string | null

  @Property({ name: 'cancelled_at', type: Date, nullable: true })
  cancelledAt?: Date | null

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null
}

/**
 * A payment of a charge (payments spec *Data Models* → `payments_payments`; REQ-012, TEST-020; issue #109): an
 * immutable credit in grosz with its method, the day the money arrived and the title or receipt. A correction is a
 * reversing entry — a negative payment of the same charge that names the original in `reverses_payment_id` (one per
 * payment, partial unique index); nothing is edited or deleted. `recorded_by_*` is who received it (B-22).
 */
@Entity({ tableName: 'payments_payments' })
@Index({ name: 'payments_payments_org_charge_idx', properties: ['organizationId', 'chargeId'] })
@Index({ name: 'payments_payments_org_method_idx', properties: ['organizationId', 'method'] })
@Index({ name: 'payments_payments_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'payments_payments_reverses_unique',
  expression:
    'create unique index "payments_payments_reverses_unique" on "payments_payments" ("reverses_payment_id") where reverses_payment_id is not null and deleted_at is null',
})
export class Payment extends ScopedEntityBase {
  [OptionalProps]?:
    ScopedEntityOptionalProps | 'reference' | 'recordedByPersonId' | 'recordedByUserId' | 'reversesPaymentId'

  @Property({ name: 'charge_id', type: 'uuid' })
  chargeId!: string

  /** Grosz; negative for a reversing entry. */
  @Property({ name: 'amount', type: 'int' })
  amount!: number

  @Property({ name: 'method', type: 'text' })
  method!: PaymentMethod

  /** The day the money arrived, in the club's calendar. */
  @Property({ name: 'paid_on', type: 'date' })
  paidOn!: string

  /** The transfer title or the receipt; for a reversing entry, its reason. Encrypted at rest. */
  @Property({ name: 'reference', type: 'text', nullable: true })
  reference?: string | null

  @Property({ name: 'recorded_by_person_id', type: 'uuid', nullable: true })
  recordedByPersonId?: string | null

  @Property({ name: 'recorded_by_user_id', type: 'uuid', nullable: true })
  recordedByUserId?: string | null

  @Property({ name: 'reverses_payment_id', type: 'uuid', nullable: true })
  reversesPaymentId?: string | null
}

/**
 * One period generation (`payments.charges.generate`; issue #108, the owner's undo default of 2026-11-05): the
 * period, the summary counts and, once undone, when. Its undo cancels the run's charges that are still open.
 */
@Entity({ tableName: 'payments_charge_generations' })
@Index({ name: 'payments_charge_generations_org_period_idx', properties: ['organizationId', 'period'] })
@Index({ name: 'payments_charge_generations_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ChargeGeneration extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'undoneAt' | 'cancelledCount'

  /** `YYYY-MM`. */
  @Property({ name: 'period', type: 'text' })
  period!: string

  @Property({ name: 'created_count', type: 'int' })
  createdCount!: number

  @Property({ name: 'skipped_count', type: 'int' })
  skippedCount!: number

  @Property({ name: 'payer_missing_count', type: 'int' })
  payerMissingCount!: number

  @Property({ name: 'undone_at', type: Date, nullable: true })
  undoneAt?: Date | null

  /** The charges the undo cancelled. */
  @Property({ name: 'cancelled_count', type: 'int', nullable: true })
  cancelledCount?: number | null
}

/**
 * The club's payment settings (payments spec *Data Models* → `payments_settings`): one row per club, created with the
 * defaults on the first change. `coach_fee_access` is the "Coaches and payments" setting (R07, DD-32, default
 * `collect`); `auto_book_bank_matches` waits for the statement import (REQ-030).
 */
@Entity({ tableName: 'payments_settings' })
@Unique({ name: 'payments_settings_organization_unique', properties: ['organizationId'] })
@Index({ name: 'payments_settings_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class PaymentsSettings extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'autoBookBankMatches' | 'coachFeeAccess'

  @Property({ name: 'auto_book_bank_matches', type: 'boolean', default: true })
  autoBookBankMatches: boolean = true

  @Property({ name: 'coach_fee_access', type: 'text', default: 'collect' })
  coachFeeAccess: CoachFeeAccess = 'collect'
}
