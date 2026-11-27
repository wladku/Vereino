// The batch train's state on the batch head (BT-D04, `.ai/specs/implemented/2026-11-18-batch-merge-train.md`): the final commit
// message on `merge-train/batch` carries
//   Merge-Train-Batch: #391@<sha>,#392@<sha>   the PRs in merge order, each with the head SHA that was tested
//   Merge-Train-Base: <sha>                     the `main` commit the batch was built on
//   Merge-Train-Suspects: #391,#392,#393        only during a bisection: the PRs not yet proven good or bad
// Pure: the train writes them with `formatTrailers` and reads them back with `parseTrailers`.

export const BATCH_TRAILER = 'Merge-Train-Batch'
export const BASE_TRAILER = 'Merge-Train-Base'
export const SUSPECTS_TRAILER = 'Merge-Train-Suspects'

const SHA = /^[0-9a-f]{40}$/
const NUMBER = /^#([1-9]\d*)$/

/** The trailer lines for a batch `{ prs: [{ number, sha }], base, suspects }`; `suspects` is left out when `null`. */
export function formatTrailers({ prs, base, suspects = null }) {
  const lines = [
    `${BATCH_TRAILER}: ${prs.map((pr) => `#${pr.number}@${pr.sha}`).join(',')}`,
    `${BASE_TRAILER}: ${base}`,
  ]
  if (suspects) lines.push(`${SUSPECTS_TRAILER}: ${suspects.map((number) => `#${number}`).join(',')}`)
  return lines.join('\n')
}

function trailerValues(message, name) {
  const prefix = `${name}:`
  return message
    .split('\n')
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
}

function parseNumber(text) {
  const match = NUMBER.exec(text)
  return match ? Number(match[1]) : null
}

function parsePr(entry) {
  const [number, sha, extra] = entry.split('@')
  if (extra !== undefined || !SHA.test(sha ?? '')) return null
  const parsed = parseNumber(number)
  return parsed ? { number: parsed, sha } : null
}

function unique(numbers) {
  return new Set(numbers).size === numbers.length
}

/**
 * Reads a batch back from a commit message: `{ prs, base, suspects }`, `suspects` `null` outside a bisection. Anything
 * malformed — a missing or repeated trailer, a bad SHA or number, a PR listed twice, a batch PR that is no suspect
 * during a bisection — gives `null`, which the train treats as "no batch" and plans afresh.
 */
export function parseTrailers(message) {
  const batch = trailerValues(message ?? '', BATCH_TRAILER)
  const base = trailerValues(message ?? '', BASE_TRAILER)
  const suspectLines = trailerValues(message ?? '', SUSPECTS_TRAILER)
  if (batch.length !== 1 || base.length !== 1 || suspectLines.length > 1 || !SHA.test(base[0])) return null
  const prs = batch[0].split(',').map(parsePr)
  if (prs.includes(null) || !unique(prs.map((pr) => pr.number))) return null
  if (!suspectLines.length) return { prs, base: base[0], suspects: null }
  const suspects = suspectLines[0].split(',').map(parseNumber)
  if (suspects.includes(null) || !unique(suspects)) return null
  if (!prs.every((pr) => suspects.includes(pr.number))) return null
  return { prs, base: base[0], suspects }
}
