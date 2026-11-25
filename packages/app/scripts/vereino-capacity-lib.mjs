// Shared helpers of the capacity test (many-clubs spec TEST-M09, phase 5; #633): an HTTP client that times every
// call, a bounded-concurrency pool, percentiles, argument parsing and the calendar dates of a club's time zone. Used by
// `vereino-capacity-seed.mjs` and `vereino-capacity-load.mjs`; never against a real or dev database.

/** `--key value` and `--flag` arguments over `defaults`; a number default makes the value a number. */
export function parseArgs(argv, defaults) {
  const options = { ...defaults }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`)
    const key = argument.slice(2)
    if (!(key in defaults)) throw new Error(`unknown option: ${argument}`)
    if (typeof defaults[key] === 'boolean') {
      options[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`option ${argument} needs a value`)
    index += 1
    if (typeof defaults[key] === 'number') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) throw new Error(`option ${argument} needs a number`)
      options[key] = parsed
    } else {
      options[key] = value
    }
  }
  return options
}

/** An HTTP client over `fetchImpl` that answers `{ status, body, ms }` and never throws for a status. */
export function createApi({ baseUrl, fetchImpl = fetch, now = () => performance.now() }) {
  return async function call(method, path, { token, json, form, headers = {}, cookie } = {}) {
    const init = { method, headers: { ...headers }, redirect: 'manual' }
    if (token) init.headers.authorization = `Bearer ${token}`
    if (cookie) init.headers.cookie = cookie
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(json)
    } else if (form !== undefined) {
      init.body = form
    }
    const started = now()
    let status = 0
    let body = null
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, init)
      status = response.status
      const text = await response.text()
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = null
      }
    } catch (error) {
      body = { error: error instanceof Error ? error.message : String(error) }
    }
    return { status, body, ms: now() - started }
  }
}

/** Runs `fn` over `items`, at most `concurrency` at a time; answers the results in order. */
export async function pool(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker))
  return results
}

/** The `p`-th percentile (0–100) of ascending `sorted` values, nearest rank; null for none. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

/** Per label: count, errors (status 0 or ≥ 500), 429s, p50/p95/p99/max in ms (rounded), sorted by label. */
export function summarize(samples, durationSec) {
  const byLabel = new Map()
  for (const sample of samples) {
    const list = byLabel.get(sample.label) ?? []
    list.push(sample)
    byLabel.set(sample.label, list)
  }
  const rows = [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => row(label, list, durationSec))
  return { rows, total: row('all', samples, durationSec) }
}

function row(label, list, durationSec) {
  const times = list.map((sample) => sample.ms).sort((a, b) => a - b)
  const round = (value) => (value === null ? null : Math.round(value))
  return {
    label,
    count: list.length,
    rps: durationSec > 0 ? Math.round((list.length / durationSec) * 10) / 10 : null,
    errors: list.filter((sample) => sample.status === 0 || sample.status >= 500).length,
    limited: list.filter((sample) => sample.status === 429).length,
    p50: round(percentile(times, 50)),
    p95: round(percentile(times, 95)),
    p99: round(percentile(times, 99)),
    max: round(times.length > 0 ? times[times.length - 1] : null),
  }
}

/** A markdown table of `summarize` rows. */
export function markdownTable(summary) {
  const header = '| Route | Requests | req/s | 5xx/failed | 429 | p50 ms | p95 ms | p99 ms | max ms |'
  const lines = [header, '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
  for (const entry of [...summary.rows, summary.total]) {
    const cells = [entry.label, entry.count, entry.rps, entry.errors, entry.limited, entry.p50, entry.p95, entry.p99]
    lines.push(`| ${[...cells, entry.max].map((cell) => (cell === null ? '–' : String(cell))).join(' | ')} |`)
  }
  return lines.join('\n')
}

/** The calendar date (`YYYY-MM-DD`) and the RRULE weekday (`MO`…`SU`) of `now` in `timeZone`. */
export function clubDay(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday.slice(0, 2).toUpperCase() }
}

/** The capacity club slug of `index` (1-based): `cap-001`. */
export function clubSlug(index) {
  return `cap-${String(index).padStart(3, '0')}`
}

/** Picks one entry of `[[value, weight], …]` for a uniform `random()` in [0, 1). */
export function pickWeighted(entries, random = Math.random) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let point = random() * total
  for (const [value, weight] of entries) {
    if (point < weight) return value
    point -= weight
  }
  return entries[entries.length - 1][0]
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
