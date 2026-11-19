// Pure rules of the B-01 payment widgets (payments parity spec REQ-C09, phase 7; issue #297 E12-S07): which statement
// transfers still wait for a decision, which order campaigns are running, how many charges without a payer the
// widget lists and what "and {n} more" counts, and the lean `?only=counts` read of spec N's menu counts. Nothing here
// reads the database (engineering standards S3.5).
import type { BankTransactionStatus } from './bank-matching'
import type { CampaignStatus } from './order-campaigns'

/** The transfers "To confirm" and "Unmatched" (B-29): each waits for the treasurer's decision. */
export const BANK_TO_DECIDE_STATUSES = ['suggested', 'unmatched'] as const satisfies readonly BankTransactionStatus[]

/** A campaign the dashboard shows: neither a draft nor completed (the mockup's `kitDashboardWidget`). */
export const RUNNING_CAMPAIGN_STATUSES = [
  'open',
  'closed',
  'ordered',
  'delivered',
] as const satisfies readonly CampaignStatus[]

/** True when the campaign in `status` is running. */
export function isRunningCampaign(status: CampaignStatus): boolean {
  return (RUNNING_CAMPAIGN_STATUSES as readonly CampaignStatus[]).includes(status)
}

/** The rows "Charges without a payer" lists before "and {n} more". */
export const WITHOUT_PAYER_LIST_LIMIT = 5

/** The `only` values `GET /api/payments/dashboard` accepts: `counts` is spec N's menu counts. */
export const DASHBOARD_ONLY = ['counts'] as const
export type DashboardOnly = (typeof DASHBOARD_ONLY)[number]

/** How many charges "and {n} more" names: all of them less those listed, never below zero. */
export function moreCount(total: number, listed: number): number {
  return Math.max(total - listed, 0)
}
