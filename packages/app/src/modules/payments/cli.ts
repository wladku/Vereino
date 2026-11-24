// Operator commands of `payments` (`yarn mercato payments <command>`). `reconcile-checkouts` is the sweep of the
// payments spec *Events* row `payments:reconcile-checkouts` (DD-42; #110): late captures are booked, `created`
// checkouts older than 24 hours expire. `close-order-campaigns` is the `payments:close-order-campaigns` sweep of order
// campaigns (#115). Both shipped as commands run by hand; since #301 (payments parity spec DD-C08) the scheduler runs
// them every 15 minutes, and the two commands stay for operators. `set-up-club` registers the club's six schedules
// (the backfill for a club created before them) and `run-job` runs one scheduled job now, optionally with `--now`.
import { parseArgs } from 'node:util'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import { reconcileCheckouts } from './services/checkout'
import { setUpClubPayments } from './services/club-setup'
import { closeOrderCampaigns } from './services/order-campaigns'

/** `payments reconcile-checkouts --tenant <id> --org <id>`: one run of the sweep for one club. */
const reconcile: ModuleCli = {
  command: 'reconcile-checkouts',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: { tenant: { type: 'string' }, org: { type: 'string' } },
      strict: false,
      allowPositionals: true,
    })
    const tenantId = typeof values.tenant === 'string' ? values.tenant : undefined
    const organizationId = typeof values.org === 'string' ? values.org : undefined
    if (!tenantId || !organizationId) {
      process.stderr.write('Usage: mercato payments reconcile-checkouts --tenant <tenantId> --org <organizationId>\n')
      throw new Error('[internal] payments reconcile-checkouts: invalid options')
    }
    const container = await createRequestContainer()
    const summary = await reconcileCheckouts(container, { tenantId, organizationId })
    // Machine-readable result for operators.
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  },
}

/** `payments close-order-campaigns --tenant <id> --org <id>`: closes the club's open campaigns past their deadline. */
const closeCampaigns: ModuleCli = {
  command: 'close-order-campaigns',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: { tenant: { type: 'string' }, org: { type: 'string' } },
      strict: false,
      allowPositionals: true,
    })
    const tenantId = typeof values.tenant === 'string' ? values.tenant : undefined
    const organizationId = typeof values.org === 'string' ? values.org : undefined
    if (!tenantId || !organizationId) {
      process.stderr.write('Usage: mercato payments close-order-campaigns --tenant <tenantId> --org <organizationId>\n')
      throw new Error('[internal] payments close-order-campaigns: invalid options')
    }
    const container = await createRequestContainer()
    const summary = await closeOrderCampaigns(container, { tenantId, organizationId })
    // Machine-readable result for operators.
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  },
}

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `payments set-up-club --tenant <id> --org <id>`: re-runs the club's `payments` setup — the six schedules — and
 * prints what it registered. Idempotent (an upsert of each schedule); the backfill for a club created before #301.
 */
const setUpClub: ModuleCli = {
  command: 'set-up-club',
  async run(argv) {
    const { tenant, org } = readOptions(argv, ['tenant', 'org'])
    if (!tenant || !org) {
      process.stderr.write('Usage: mercato payments set-up-club --tenant <tenantId> --org <organizationId>\n')
      throw new Error('[internal] payments set-up-club: invalid options')
    }
    const container = await createRequestContainer()
    const result = await setUpClubPayments(container, { tenantId: tenant, organizationId: org })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!Object.values(result.schedules).every(Boolean))
      throw new Error('[internal] payments set-up-club: a schedule was not registered')
  },
}

/** The job command each scheduled job dispatches (payments parity spec DD-C08). */
const JOB_COMMANDS: Readonly<Record<string, string>> = {
  'generate-charges': 'payments.charges.generate_due',
  'overdue-reminders': 'payments.charges.remind_overdue',
  'reconcile-checkouts': 'payments.checkouts.reconcile',
  'close-order-campaigns': 'payments.order_campaigns.close_due',
  'purge-order-links': 'payments.order_links.purge_dead',
  'verify-invariants': 'payments.invariants.verify',
}

/**
 * `payments run-job --job <name> --tenant <id> --org <id> [--now <ISO instant>]`: runs one scheduled job now — the
 * same job command its worker dispatches — and prints its result. `--now` moves the clock (an operator replaying a
 * missed day; the integration tests drive the generation day and the reminder cadence through it).
 */
const runJob: ModuleCli = {
  command: 'run-job',
  async run(argv) {
    const { job, tenant, org, now } = readOptions(argv, ['job', 'tenant', 'org', 'now'])
    const commandId = job ? JOB_COMMANDS[job] : undefined
    if (!commandId || !tenant || !org) {
      process.stderr.write(
        `Usage: mercato payments run-job --job <${Object.keys(JOB_COMMANDS).join('|')}> --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n`,
      )
      throw new Error('[internal] payments run-job: invalid options')
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, { job: { now: Date } } & Record<string, unknown>>(commandId, {
      input: now ? { now } : {},
      ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
    })
    const { job: run, ...rest } = result
    process.stdout.write(`${JSON.stringify({ now: run.now.toISOString(), ...rest })}\n`)
  },
}

const commands: ModuleCli[] = [reconcile, closeCampaigns, setUpClub, runJob]

export default commands
