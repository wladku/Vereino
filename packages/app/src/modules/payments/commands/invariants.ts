// `payments.invariants.verify` — the job command of the nightly `payments:verify-invariants` (club spec REQ-043,
// AC-043, TEST-088; engineering standards S10.6; #531). Only a session-less job context for the club it was
// registered for runs it (`authorizePaymentsJob`); the operator command `payments run-job --job verify-invariants`
// runs the same command. It recomputes every charge's paid amount and status from its payments and checks the `KP`
// and `RG` numbering, reports drift as an operations alert and changes no data — so it writes no audit entry.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { hasDrift, type ChargeDrift, type InvariantsReport, type NumberingDrift } from '../lib/invariants'
import { readPaymentsInvariants, reportPaymentsInvariants, type InvariantsHeartbeat } from '../services/invariants'
import { authorizePaymentsJob, type PaymentsJobScope } from './shared'

export type VerifyInvariantsResult = {
  job: PaymentsJobScope
  counts: InvariantsReport['counts']
  drift: boolean
  chargeDrifts: ChargeDrift[]
  numberingDrifts: NumberingDrift[]
  heartbeat: InvariantsHeartbeat
}

const verifyInvariantsCommand: CommandHandler<Record<string, unknown>, VerifyInvariantsResult> = {
  id: 'payments.invariants.verify',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const job = await authorizePaymentsJob(ctx, 'payments.invariants.verify.authorize', rawInput)
    const scope = { tenantId: job.tenantId, organizationId: job.organizationId }
    const report = await readPaymentsInvariants(ctx.container.resolve<EntityManager>('em').fork(), scope)
    const heartbeat = await reportPaymentsInvariants(scope, report)
    return { job, ...report, drift: hasDrift(report), heartbeat }
  },
}

registerCommand(verifyInvariantsCommand)
