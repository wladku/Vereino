// Nightly off-site backup (engineering standards S15.7, ENG-10, issue #464): `pg_dump -Fc` of the database,
// encrypted with age to the public key(s) in `docker/backup/age-recipients.txt`, uploaded to an S3-compatible EU
// bucket as `daily/vereino-YYYY-MM-DD.dump.age` (plus `monthly/vereino-YYYY-MM.dump.age` for the first copy of a
// month), keeping 30 daily and 12 monthly copies. Runs as the Railway cron service `railway.backup.toml`.
// The plaintext dump never touches the disk: pg_dump streams into age, and only the ciphertext is written.
// Every line on stdout/stderr is one JSON object; a failure is `"msg":"backup.dump.failed"`. The outcome also goes to
// the E18-S04 alert path (#465, #519) through `packages/app/scripts/vereino-ops-signal.mjs`, which the job image copies
// in: one `vereino.ops.backup.*` line per run phase and, when `VEREINO_OPS_BACKUP_HEARTBEAT_URL` is set, a heartbeat
// ping (`<url>` on success, `<url>/fail` on failure). A run that never starts sends no ping, so the heartbeat's
// missing-ping alert catches it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUCKET_VARIABLES,
  DAILY_DIR,
  DAILY_KEEP,
  DEFAULT_RECIPIENTS_FILE,
  MONTHLY_DIR,
  MONTHLY_KEEP,
  backupNames,
  expiredBackups,
  failures,
  missingVariables,
  objectKey,
  parseListing,
  rcloneEnv,
  remotePath,
  runPipeline,
} from './backup-common.mjs'
import {
  HEARTBEAT_URL_VARIABLES,
  OPS_EVENTS,
  formatOpsLine,
  pingHeartbeat,
} from '../packages/app/scripts/vereino-ops-signal.mjs'

export const JOB = 'backup:dump'
export const REQUIRED_VARIABLES = ['DATABASE_URL', ...BUCKET_VARIABLES]

// One JSON log line; constant message, values in fields (S15.1).
export function logLine(write, level, msg, fields = {}) {
  write(`${JSON.stringify({ level, job: JOB, msg, ...fields })}\n`)
}

// Counts the age recipients (`age1…` public keys) in a recipients file; comments and blank lines do not count.
export function countRecipients(text) {
  return text.split('\n').filter((line) => line.trim().startsWith('age1')).length
}

export const HEARTBEAT_VARIABLE = HEARTBEAT_URL_VARIABLES.backup

// Writes the `vereino.ops.backup.*` line of `event` and, for an outcome, pings the heartbeat when its URL is set.
// A refused ping is logged by variable name only (the URL holds the check's secret) and never changes the exit code:
// a missing success ping still raises the heartbeat's missed-run alert.
export async function reportOps(event, fields, { env, now, stdout, stderr, fetchImpl }) {
  const { level, outcome } = OPS_EVENTS[event]
  const write = level === 'error' ? stderr : stdout
  write(`${formatOpsLine(event, fields, { now: () => now().getTime() })}\n`)
  const url = env[HEARTBEAT_VARIABLE]
  if (!outcome || !url) return
  if (!(await pingHeartbeat(url, outcome, { fetchImpl }))) {
    logLine(stderr, 'warn', 'backup.heartbeat.failed', { variable: HEARTBEAT_VARIABLE })
  }
}

class StepError extends Error {
  constructor(reason, fields) {
    super(reason)
    this.fields = fields
  }
}

async function listFolder(run, env, bucket, folder) {
  const listing = await run([{ command: 'rclone', args: ['lsjson', '--files-only', remotePath(bucket, folder)], env }], {
    capture: true,
  })
  // rclone exits 3 ("directory not found") for a folder that holds no object yet.
  if (listing.results[0].code === 3) return []
  if (!listing.ok) throw new StepError('list-failed', { folder, failed: failures(listing) })
  return parseListing(listing.stdout)
}

async function upload(run, env, file, bucket, key) {
  const result = await run([{ command: 'rclone', args: ['copyto', file, remotePath(bucket, key)], env }])
  if (!result.ok) throw new StepError('upload-failed', { key, failed: failures(result) })
}

async function prune(run, env, bucket, folder, { monthly, keep }) {
  const expired = expiredBackups(await listFolder(run, env, bucket, folder), { monthly, keep })
  for (const name of expired) {
    const key = `${folder}/${name}`
    const result = await run([{ command: 'rclone', args: ['deletefile', remotePath(bucket, key)], env }])
    if (!result.ok) throw new StepError('prune-failed', { key, failed: failures(result) })
  }
  return expired.length
}

export async function main({
  env = process.env,
  now = () => new Date(),
  stdout = process.stdout.write.bind(process.stdout),
  stderr = process.stderr.write.bind(process.stderr),
  run = runPipeline,
  tmpDir = os.tmpdir(),
  fetchImpl = fetch,
} = {}) {
  const ops = (event, fields = {}) => reportOps(event, fields, { env, now, stdout, stderr, fetchImpl })
  const missing = missingVariables(env, REQUIRED_VARIABLES)
  if (missing.length > 0) {
    logLine(stderr, 'error', 'backup.dump.failed', { reason: 'missing-variable', variables: missing })
    await ops('backup.failed', { step: 'missing-variable' })
    return 1
  }
  const recipientsFile = env.BACKUP_AGE_RECIPIENTS_FILE || DEFAULT_RECIPIENTS_FILE
  const recipients = fs.existsSync(recipientsFile) ? countRecipients(fs.readFileSync(recipientsFile, 'utf8')) : 0
  if (recipients === 0) {
    logLine(stderr, 'error', 'backup.dump.failed', { reason: 'no-recipient', recipientsFile })
    await ops('backup.failed', { step: 'no-recipient' })
    return 1
  }

  const startedAt = now()
  const names = backupNames(startedAt)
  const bucket = env.BACKUP_S3_BUCKET
  const s3 = rcloneEnv(env)
  const dailyFolder = objectKey(env.BACKUP_S3_PREFIX, DAILY_DIR)
  const monthlyFolder = objectKey(env.BACKUP_S3_PREFIX, MONTHLY_DIR)
  const dailyKey = `${dailyFolder}/${names.daily}`
  logLine(stdout, 'info', 'backup.dump.started', { key: dailyKey, recipients })
  await ops('backup.started')

  const workDir = fs.mkdtempSync(path.join(tmpDir, 'vereino-backup-'))
  const encrypted = path.join(workDir, names.daily)
  let outcome = { event: 'backup.failed', fields: { step: 'unexpected' } }
  try {
    const dump = await run([
      {
        command: 'pg_dump',
        args: ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${env.DATABASE_URL}`],
        env: { PATH: s3.PATH, HOME: s3.HOME },
      },
      { command: 'age', args: ['--encrypt', '--recipients-file', recipientsFile, '--output', encrypted], env: { PATH: s3.PATH } },
    ])
    if (!dump.ok) throw new StepError('dump-failed', { failed: failures(dump) })
    const bytes = fs.statSync(encrypted).size

    await upload(run, s3, encrypted, bucket, dailyKey)
    const monthlyCopies = await listFolder(run, s3, bucket, monthlyFolder)
    let monthlyKey = null
    if (!monthlyCopies.includes(names.monthly)) {
      monthlyKey = `${monthlyFolder}/${names.monthly}`
      await upload(run, s3, encrypted, bucket, monthlyKey)
    }
    const prunedDaily = await prune(run, s3, bucket, dailyFolder, { monthly: false, keep: DAILY_KEEP })
    const prunedMonthly = await prune(run, s3, bucket, monthlyFolder, { monthly: true, keep: MONTHLY_KEEP })
    const durationMs = now().getTime() - startedAt.getTime()
    logLine(stdout, 'info', 'backup.dump.succeeded', {
      key: dailyKey,
      monthlyKey,
      bytes,
      prunedDaily,
      prunedMonthly,
      durationMs,
    })
    outcome = { event: 'backup.succeeded', fields: { bytes, durationMs } }
  } catch (error) {
    const fields = error instanceof StepError ? { reason: error.message, ...error.fields } : { reason: 'unexpected' }
    logLine(stderr, 'error', 'backup.dump.failed', { key: dailyKey, ...fields })
    outcome.fields.step = fields.reason
  }
  // The ciphertext is only a staging copy; it never outlives the run.
  fs.rmSync(workDir, { recursive: true, force: true })
  await ops(outcome.event, outcome.fields)
  return outcome.event === 'backup.succeeded' ? 0 : 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
