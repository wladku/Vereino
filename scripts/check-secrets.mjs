#!/usr/bin/env node
// Secrets and personal-data guard (engineering standards S8.10: secrets never enter the repository).
// GitHub secret scanning only knows provider token formats, and its generic patterns (passwords,
// private keys, connection strings) are not available for a user-owned repository, so an agent could
// commit a hard-coded password or a real person's e-mail address and nothing would stop it before
// review (#511). This step scans every tracked text file (`git ls-files`) with plain Node, no scanner
// dependency, and fails with `file:line [rule]` for each hit.
//
// Known false positives go into `scripts/secrets-allowlist.json`: `{ path, rule, reason }`, optionally
// `match` (a substring the hit must contain) to keep the exception narrow.
// Usage: node scripts/check-secrets.mjs [--root <repo-root>]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ALLOWLIST_FILE = 'scripts/secrets-allowlist.json'

// Never scanned: lock files and the allow-list itself (it quotes what it allows).
export const SKIPPED_FILES = new Set(['yarn.lock', ALLOWLIST_FILE])

// Reserved example/test domains (RFC 2606, RFC 6761, RFC 6762). Subdomains of each are allowed too.
export const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'test', 'example', 'invalid', 'localhost', 'local']

// A domain with one of these labels is a placeholder in any language and under any TLD (`example.pl`,
// `przyklad.pl` and `ejemplo.com` in the i18n catalogs and fixtures).
export const PLACEHOLDER_DOMAIN_LABELS = ['example', 'przyklad', 'beispiel', 'ejemplo', 'exemple', 'esempio', 'voorbeeld', 'exemplo', 'your-domain', 'yourdomain']

// Generic top-level domains that real addresses use; any two-letter label is a country code. Anything
// else after the `@` (`widget@sales.document.detail.order`) is an injection-spot id, not an address.
const GENERIC_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'io', 'dev', 'app', 'ai',
  'cloud', 'online', 'site', 'tech', 'email', 'mail', 'club', 'sport', 'team', 'shop', 'xyz', 'eu', 'asia',
])

// Values that name a secret instead of holding one: env lookups, template slots, masks and the words
// docs and dev defaults use for "put yours here".
const PLACEHOLDER_PATTERNS = [
  /^\s*$/,
  /^[$%<{[(]/,
  /\$\{/,
  /^process\.env/,
  /^(?:x+|\*+|\.+|-+|_+|#+|0+)$/i,
  /change[-_ ]?me|placeholder|example|your[-_ ]|dummy|redacted|not[-_ ]?a[-_ ]?secret|fake|sample|replace[-_ ]?me|todo/i,
]

// Single-pattern rules. Each regex is global so one line can report several hits.
export const TOKEN_RULES = [
  { id: 'private-key', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'stripe-key', pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{3,}|\bwhsec_[0-9A-Za-z]{16,}/g },
  { id: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{20,}|\bgithub_pat_[0-9A-Za-z_]{20,}/g },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'slack-token', pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}/g },
  { id: 'jwt', pattern: /\beyJ[0-9A-Za-z_-]{8,}\.eyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}/g },
]

// scheme://user:password@host — reported when the password is a literal and the host is a public name.
const URL_CREDENTIAL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@'"`]+):([^\s/@'"`]+)@([^\s/:'"`]+)/gi
const LOCAL_HOST_PATTERN = /^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\]|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2})$/i

// `password = 'x'`, `apiKey: "x"`, `"client_secret": "x"` — a key that ends in a secret word, assigned a
// quoted literal. `.env` files also match the unquoted `AUTH_SECRET=value`.
const SECRET_KEY = String.raw`[A-Za-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)`
const ASSIGNMENT_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9_-])["']?(${SECRET_KEY})["']?\s*[:=]\s*(["'\`])((?:(?!\2).)*)\2`,
  'gi',
)
const ENV_ASSIGNMENT_PATTERN = new RegExp(String.raw`^\s*(?:export\s+)?(${SECRET_KEY})\s*=\s*([^\s"'\`#][^\s#]*)`, 'i')
const PASSWORD_KEY_PATTERN = /(?:password|passwd|pwd)$/i
// A word or dotted/kebab/snake id of letters only (`declaration`, `not-applicable`,
// `vereino.contactResolver`): a mode, kind or DI token name, not a secret.
const IDENTIFIER_PATTERN = /^[A-Za-z]+(?:[-_.][A-Za-z]+)*$/

// The character before the local part must not be `/` (a mailing-list message id inside a URL).
const EMAIL_PATTERN = /(?<![/A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})\b/g

export function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
}

export function isAllowedEmailDomain(domain) {
  const lower = domain.toLowerCase()
  if (ALLOWED_EMAIL_DOMAINS.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`))) return true
  return lower.split('.').some((label) => PLACEHOLDER_DOMAIN_LABELS.includes(label))
}

// True when the text after `@` can be a real mail domain (its last label is a TLD real addresses use).
export function isMailDomain(domain) {
  const tld = domain.toLowerCase().split('.').at(-1)
  return tld.length === 2 || GENERIC_TLDS.has(tld)
}

// A literal assigned to a secret-named key counts when it could be a credential: any password value
// that is not a placeholder; for tokens, secrets and keys only a value of 8+ characters without spaces
// that is not a plain lowercase identifier.
export function isSecretValue(key, value) {
  if (isPlaceholder(value) || /\s/.test(value)) return false
  if (PASSWORD_KEY_PATTERN.test(key)) return true
  return value.length >= 8 && !IDENTIFIER_PATTERN.test(value)
}

export function isPublicHost(host) {
  return host.includes('.') && !LOCAL_HOST_PATTERN.test(host) && !isAllowedEmailDomain(host) && !isPlaceholder(host)
}

export function isEnvFile(filePath) {
  return /(?:^|\/)\.env(?:\.[^/]*)?$/.test(filePath)
}

// UI catalogs (`i18n/<locale>.json`, a bundled `i18n.js`) hold the labels of password fields (`Hasło`);
// only the key/value rule skips them.
export function isCatalogFile(filePath) {
  return /(?:^|\/)i18n(?:\/[^/]+)?\.(?:json|js|ts)$/.test(filePath)
}

// Every hit on one line: `{ rule, match }`.
export function scanLine(line, { envFile = false, catalogFile = false } = {}) {
  const hits = []
  for (const { id, pattern } of TOKEN_RULES) {
    for (const found of line.matchAll(pattern)) hits.push({ rule: id, match: found[0] })
  }
  for (const found of line.matchAll(URL_CREDENTIAL_PATTERN)) {
    if (!isPlaceholder(found[2]) && isPublicHost(found[3])) hits.push({ rule: 'url-credentials', match: found[0] })
  }
  if (!catalogFile) {
    for (const found of line.matchAll(ASSIGNMENT_PATTERN)) {
      if (isSecretValue(found[1], found[3])) hits.push({ rule: 'secret-assignment', match: found[0] })
    }
  }
  const envAssignment = envFile ? line.match(ENV_ASSIGNMENT_PATTERN) : null
  if (envAssignment && isSecretValue(envAssignment[1], envAssignment[2])) {
    hits.push({ rule: 'secret-assignment', match: envAssignment[0].trim() })
  }
  // The `user:password@host` of a URL is the url-credentials rule's, not an address.
  for (const found of line.replace(URL_CREDENTIAL_PATTERN, ' ').matchAll(EMAIL_PATTERN)) {
    if (isMailDomain(found[1]) && !isAllowedEmailDomain(found[1])) hits.push({ rule: 'email', match: found[0] })
  }
  return hits
}

export function scanText(filePath, text) {
  const options = { envFile: isEnvFile(filePath), catalogFile: isCatalogFile(filePath) }
  const findings = []
  text.split('\n').forEach((line, index) => {
    for (const hit of scanLine(line, options)) findings.push({ path: filePath, line: index + 1, ...hit })
  })
  return findings
}

export function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0)
}

export function validateAllowlist(entries) {
  if (!Array.isArray(entries)) throw new Error(`${ALLOWLIST_FILE}: must be a JSON array`)
  entries.forEach((entry, index) => {
    for (const key of ['path', 'rule', 'reason']) {
      if (typeof entry?.[key] !== 'string' || entry[key].trim() === '') {
        throw new Error(`${ALLOWLIST_FILE}: entry ${String(index)} needs a non-empty "${key}"`)
      }
    }
    if (entry.match !== undefined && (typeof entry.match !== 'string' || entry.match === '')) {
      throw new Error(`${ALLOWLIST_FILE}: entry ${String(index)} has an empty "match"`)
    }
  })
  return entries
}

export function isAllowed(finding, allowlist) {
  return allowlist.some(
    (entry) => entry.path === finding.path && entry.rule === finding.rule
      && (entry.match === undefined || finding.match.includes(entry.match)),
  )
}

export function listTrackedFiles(rootDir, exec = execFileSync) {
  return exec('git', ['ls-files', '-z'], { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)
}

// Findings not covered by the allow-list, plus allow-list entries that no longer match anything.
export function checkSecrets(rootDir, { files = listTrackedFiles(rootDir), allowlist = [] } = {}) {
  const findings = []
  for (const file of files) {
    if (SKIPPED_FILES.has(file)) continue
    const absolute = path.join(rootDir, file)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue
    const buffer = fs.readFileSync(absolute)
    if (isBinary(buffer)) continue
    findings.push(...scanText(file, buffer.toString('utf8')))
  }
  const unused = allowlist.filter((entry) => !findings.some((finding) => isAllowed(finding, [entry])))
  return { findings: findings.filter((finding) => !isAllowed(finding, allowlist)), unused }
}

export function readAllowlist(rootDir) {
  const file = path.join(rootDir, ALLOWLIST_FILE)
  if (!fs.existsSync(file)) return []
  return validateAllowlist(JSON.parse(fs.readFileSync(file, 'utf8')))
}

export function parseRoot(args) {
  if (args.length === 0) return process.cwd()
  if (args.length === 2 && args[0] === '--root') return path.resolve(args[1])
  throw new Error('Usage: check-secrets.mjs [--root <repo-root>]')
}

// The hit itself is never printed in full, so the gate log does not repeat a leaked secret.
export function mask(match) {
  return match.length <= 8 ? '***' : `${match.slice(0, 6)}***`
}

export function main({ args, log, logError, files }) {
  const rootDir = parseRoot(args)
  const { findings, unused } = checkSecrets(rootDir, { files, allowlist: readAllowlist(rootDir) })
  for (const finding of findings) {
    logError(`- ${finding.path}:${String(finding.line)} [${finding.rule}] ${mask(finding.match)}`)
  }
  for (const entry of unused) {
    logError(`- ${ALLOWLIST_FILE}: unused entry for ${entry.path} [${entry.rule}]; remove it`)
  }
  if (findings.length > 0 || unused.length > 0) {
    if (findings.length > 0) {
      logError(
        'Hard-coded secrets or real e-mail addresses found. Read configuration from VEREINO_* env variables, use a'
        + ` reserved domain (${ALLOWED_EMAIL_DOMAINS.slice(0, 3).join(', ')}, *.test) for e-mails, or, for a`
        + ` false positive, add { path, rule, reason } to ${ALLOWLIST_FILE}.`,
      )
    }
    return 1
  }
  log(`No secrets or real e-mail addresses found: ${rootDir}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
