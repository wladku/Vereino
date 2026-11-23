import { expect, test } from '@playwright/test'
import { mercatoAsync } from '../_fixtures/club'

// Issue #642 (lesson `mercato-module-cli-exit-code`): `mercato` ends with `process.exit(0)` after a module command that
// returns, so a Vereino module CLI that set `process.exitCode = 1` after a usage error exited 0 and a deploy script or
// CI step saw success. Every usage error of a Vereino module command now prints its usage to stderr and exits 1. The
// calls carry no club scope, so none of them reaches the database.
test.describe.configure({ timeout: 600_000 })

const COMMANDS: string[][] = [
  ['activities', 'generate-occurrences'],
  ['activities', 'expire-guardian-confirmations'],
  ['activities', 'send-declaration-reminders'],
  ['activities', 'purge-declaration-links'],
  ['activities', 'warn-unassigned-sessions'],
  ['activities', 'set-up-club'],
  ['activities', 'contact-access-log'],
  ['activities', 'check-append-only'],
  ['club_core', 'check-bookable-place'],
  ['foundation', 'sync-role-acls-if-changed', '--bogus'],
  ['facilities', 'rental-lifecycle'],
  ['facilities', 'expire-requests'],
  ['facilities', 'maintenance-reminders'],
  ['facilities', 'purge-rental-links'],
  ['facilities', 'set-up-club'],
  ['groups', 'seed-age-categories'],
  ['payments', 'reconcile-checkouts'],
  ['payments', 'close-order-campaigns'],
  ['payments', 'set-up-club'],
  ['payments', 'run-job'],
  ['people', 'sync-role-expiry'],
  ['people', 'bootstrap-admin'],
  ['people', 'check-own-payments'],
  ['people', 'purge-import-rows'],
  // Both options together are refused before the run starts, even with a scope.
  ['people', 'life-cycle', '--tenant', 'tenant', '--org', 'org', '--dry-run', '--register-schedule'],
]

/** The message of the `mercatoAsync` rejection, or `exited 0` when the command succeeded. */
async function failureOf(args: string[]): Promise<string> {
  try {
    await mercatoAsync(args)
    return `yarn mercato ${args.join(' ')} exited 0`
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

test('ISSUE-642 a Vereino module command exits 1 after a usage error', async () => {
  const failures: string[] = []
  // A few at a time: every call boots the CLI.
  for (let start = 0; start < COMMANDS.length; start += 4) {
    failures.push(...(await Promise.all(COMMANDS.slice(start, start + 4).map(failureOf))))
  }
  COMMANDS.forEach(([moduleId, command, ...rest], index) => {
    const failure = failures[index]
    expect(failure, `${moduleId} ${command} ${rest.join(' ')}`).toContain(`${moduleId} ${command}`)
    expect(failure).toMatch(/ exited 1: /)
    expect(failure).toContain(`Usage: mercato ${moduleId} ${command} `)
  })
})
