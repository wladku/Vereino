// Docs-only PRs (#777; SDLC.md "Validation gate"): the `changes` job of `.github/workflows/ci.yml` runs this script on
// `pull_request` events and writes `code=true|false` to `$GITHUB_OUTPUT`. With `code=false` the integration shards,
// the browser-smoke work, image-smoke and perf are skipped, and the required checks `integration` and `browser-smoke`
// still report success; `gate` always runs in full. `push` events (to `main` and `merge-train/**`) never call it.
//
// Docs-only means every changed path is documentation (`isDocsPath`). Anything else counts as code, and so does an
// empty or unreadable diff: when in doubt, everything runs.
//
// Usage: node scripts/ci-changes.mjs <base> <head>   (the CI job passes HEAD^1 HEAD of the PR merge commit)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Paths that stay code even when they end in `.md`: the integration tests, CI, scripts and the agent harness. */
const CODE_PREFIXES = ['.github/', 'scripts/', '.ai/harness/']
const CODE_PATTERNS = [/^packages\/[^/]+\/\.ai\/qa\/tests\//]

/** Documentation directories, whatever the file type. */
const DOCS_PREFIXES = ['docs/', '.ai/specs/', '.ai/runs/', '.ai/lessons/', '.ai/decisions/', '.ai/qa/scenarios/']

/** Whether a changed path is documentation; `**\/*.md` anywhere outside `CODE_PREFIXES`/`CODE_PATTERNS`. */
export function isDocsPath(file) {
  if (CODE_PREFIXES.some((prefix) => file.startsWith(prefix))) return false
  if (CODE_PATTERNS.some((pattern) => pattern.test(file))) return false
  if (DOCS_PREFIXES.some((prefix) => file.startsWith(prefix))) return true
  return file.toLowerCase().endsWith('.md')
}

/** Whether a PR with these changed paths needs the full suite: any code path, or no path at all. */
export function codeChanged(paths) {
  const changed = paths.map((file) => file.trim()).filter(Boolean)
  return changed.length === 0 || !changed.every(isDocsPath)
}

/**
 * The changed paths between `base` and `head`. `--no-renames` lists both sides of a rename, so a code file renamed to
 * `.md` still counts as code. A failing `git` throws, and the job fails closed (the required checks then fail).
 */
export function changedPaths(base, head, run = execFileSync) {
  const output = run('git', ['diff', '--name-only', '--no-renames', `${base}...${head}`], { encoding: 'utf8' })
  return output.split('\n')
}

/** Computes the `code=` line and appends it to `outputFile` (`$GITHUB_OUTPUT`), or prints it when there is none. */
export function main(args, { run = execFileSync, outputFile = process.env.GITHUB_OUTPUT, log = console.log } = {}) {
  const [base, head] = args
  if (!base || !head) throw new Error('usage: node scripts/ci-changes.mjs <base> <head>')
  const paths = changedPaths(base, head, run).filter(Boolean)
  const code = codeChanged(paths)
  log(`${paths.length} changed path(s); ${code ? 'code changed: the full suite runs' : 'docs only: heavy jobs skip'}`)
  for (const file of paths) log(`  ${isDocsPath(file) ? 'docs' : 'code'}  ${file}`)
  const line = `code=${code}\n`
  if (outputFile) appendFileSync(outputFile, line)
  else log(line.trim())
  return code
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
