// Operations signals (engineering standards S15.5, E18-S04 #465): the log lines and heartbeat pings that the alerts in
// `docs/ops/monitoring.md` watch. A job that is not a platform worker — today the nightly backup (E18-S03, #464) —
// writes its outcome through this file, so the line always carries the documented alert token:
//   node packages/app/scripts/vereino-ops-signal.mjs backup.failed step=upload exitCode=1
// prints one JSON line (Railway parses single-line JSON; `level` is a string because Railway documents only string
// levels) and, when `VEREINO_OPS_BACKUP_HEARTBEAT_URL` is set, pings the heartbeat monitor (`<url>` on success, `<url>/fail`
// on failure). Fields carry ids, counts and step names only (S15.1): a value that looks like a URL or connection string
// is replaced, because it may hold credentials.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Every alert token starts with this prefix; the token is the substring a log search or alert filter matches. */
export const OPS_SIGNAL_PREFIX = 'vereino.ops.'

/** The events a job may report, with their level and constant message (S15.1: messages are constant strings). */
export const OPS_EVENTS = {
  'backup.started': { level: 'info', msg: 'Backup started', outcome: null },
  'backup.succeeded': { level: 'info', msg: 'Backup succeeded', outcome: 'success' },
  'backup.failed': { level: 'error', msg: 'Backup failed', outcome: 'failure' },
}

/** The heartbeat URL variable of each event family; the family is the part of the event before the first dot. */
export const HEARTBEAT_URL_VARIABLES = { backup: 'VEREINO_OPS_BACKUP_HEARTBEAT_URL' }

/**
 * The documented alert filters (`docs/ops/monitoring.md` → *Log filters*). A test checks that the runbook names each
 * one, so the code and the document cannot drift apart.
 */
export const ALERT_FILTERS = { backupFailed: `${OPS_SIGNAL_PREFIX}backup.failed` }

const RESERVED_KEYS = new Set(['level', 'time', 'name', 'msg', 'signal'])
const FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/
const URL_LIKE = /[a-z][a-z0-9+.-]*:\/\//i
const MAX_VALUE_LENGTH = 200
export const REDACTED_URL = '[redacted-url]'

/** The alert token of an event, e.g. `vereino.ops.backup.failed`. */
export function opsSignal(event) {
  return `${OPS_SIGNAL_PREFIX}${event}`
}

function safeValue(key, value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'string') throw new Error(`[internal] ops field ${key} must be a string, number or boolean`)
  if (URL_LIKE.test(value)) return REDACTED_URL
  return value.length > MAX_VALUE_LENGTH ? value.slice(0, MAX_VALUE_LENGTH) : value
}

/** One single-line JSON log record for `event`; throws on an unknown event or an unsafe field. */
export function formatOpsLine(event, fields = {}, { now = Date.now } = {}) {
  const definition = OPS_EVENTS[event]
  if (!definition) throw new Error(`[internal] unknown ops event ${String(event)}`)
  const record = { level: definition.level, time: now(), name: 'ops', signal: opsSignal(event), msg: definition.msg }
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (RESERVED_KEYS.has(key) || !FIELD_KEY.test(key))
      throw new Error(`[internal] ops field name ${key} is not allowed`)
    record[key] = safeValue(key, value)
  }
  return JSON.stringify(record)
}

/** Whether a log line matches an alert filter: a plain substring, as Railway's text search and every vendor match it. */
export function matchesAlertFilter(line, filter) {
  return line.includes(filter)
}

/** The URL to ping for an outcome: the check URL on success, `<url>/fail` on failure (Healthchecks.io, Better Stack). */
export function heartbeatUrl(base, outcome) {
  const trimmed = base.replace(/\/+$/, '')
  return outcome === 'failure' ? `${trimmed}/fail` : trimmed
}

/** Pings the heartbeat monitor; never throws and resolves false when the URL is missing or the ping fails. */
export async function pingHeartbeat(base, outcome, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!base) return false
  try {
    const response = await fetchImpl(heartbeatUrl(base, outcome), {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Parses `<event> [key=value …]`; a value of digits only becomes a number. Returns null on a usage error. */
export function parseCliArgs(argv) {
  const [event, ...pairs] = argv
  if (!event || !OPS_EVENTS[event]) return null
  const fields = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    if (separator <= 0) return null
    const value = pair.slice(separator + 1)
    fields[pair.slice(0, separator)] = /^\d{1,15}$/.test(value) ? Number(value) : value
  }
  return { event, fields }
}

/** Prints the line and pings the event family's heartbeat; exit code 0, or 2 on a usage or field error. */
export async function runCli({ argv, env = process.env, out = console.log, error = console.error, fetchImpl = fetch }) {
  const parsed = parseCliArgs(argv)
  if (!parsed) {
    error(`usage: vereino-ops-signal.mjs <${Object.keys(OPS_EVENTS).join('|')}> [key=value …]`)
    return 2
  }
  let line
  try {
    line = formatOpsLine(parsed.event, parsed.fields)
  } catch (failure) {
    error(failure.message)
    return 2
  }
  out(line)
  const { outcome } = OPS_EVENTS[parsed.event]
  const variable = HEARTBEAT_URL_VARIABLES[parsed.event.split('.')[0]]
  if (outcome && variable && env[variable]) {
    const delivered = await pingHeartbeat(env[variable], outcome, { fetchImpl })
    if (!delivered) error(`ops-signal: the heartbeat ping of ${variable} failed`)
  }
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({ argv: process.argv.slice(2) })
}
