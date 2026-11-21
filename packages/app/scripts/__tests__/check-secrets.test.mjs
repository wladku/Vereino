// Unit tests for the secrets and personal-data guard (`yarn secrets:check`, S8.10, #511).
// Every sample secret is assembled from parts so this file itself never holds one and passes the scan.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ALLOWLIST_FILE,
  checkSecrets,
  isAllowed,
  isAllowedEmailDomain,
  isBinary,
  isCatalogFile,
  isEnvFile,
  isMailDomain,
  isPlaceholder,
  isPublicHost,
  isSecretValue,
  listTrackedFiles,
  main,
  mask,
  parseRoot,
  readAllowlist,
  scanLine,
  scanText,
  validateAllowlist,
} from '../../../../scripts/check-secrets.mjs'

const at = '@'
const join = (...parts) => parts.join('')

// Each rule: one line that must hit and one placeholder-like line that must pass.
const RULE_CASES = [
  {
    rule: 'private-key',
    hit: join('-----BEGIN ', 'RSA PRIVATE KEY-----'),
    pass: join('-----BEGIN ', 'PUBLIC KEY-----'),
  },
  { rule: 'private-key', hit: join('-----BEGIN ', 'PRIVATE KEY-----'), pass: 'PRIVATE KEY without the armour' },
  {
    rule: 'stripe-key',
    hit: join("const key = 'sk", '_live_', "4eC39HqLyjWDarjtT1zdp7dc'"),
    pass: "const prefix = 'sk_live_'",
  },
  { rule: 'stripe-key', hit: join('rk', '_live_', 'abcdef'), pass: 'rk_test_abcdef' },
  { rule: 'stripe-key', hit: join('whsec', '_', 'a'.repeat(32)), pass: 'whsec_short' },
  { rule: 'github-token', hit: join('ghp', '_', 'A1'.repeat(18)), pass: 'ghp_short' },
  { rule: 'github-token', hit: join('github', '_pat_', '11AB'.repeat(6)), pass: 'github_pat_' },
  { rule: 'github-token', hit: join('gho', '_', 'z9'.repeat(18)), pass: 'gho_' },
  { rule: 'aws-access-key', hit: join('AKIA', 'Z7Q3XK2M9P4L6N8B'), pass: 'AKIA_SHORT' },
  { rule: 'slack-token', hit: join('xoxb', '-1234567890-abcdef'), pass: 'xoxz-1234567890-abcdef' },
  {
    rule: 'jwt',
    hit: join(
      'eyJ',
      'hbGciOiJIUzI1NiJ9',
      '.',
      'eyJ',
      'zdWIiOiIxMjM0NTY3ODkwIn0',
      '.',
      'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ),
    pass: 'eyJhbGciOiJIUzI1NiJ9 alone',
  },
  {
    rule: 'url-credentials',
    hit: join('postgres://admin:S3cr3t', at, 'db.prod-cluster.com:5432/app'),
    pass: join('postgres://u:p', at, 'localhost:5432'),
  },
  {
    rule: 'url-credentials',
    hit: join('https://bot:hunter2', at, 'api.club.pl'),
    pass: join('postgres://u:${PASSWORD}', at, 'db.club.pl'),
  },
  {
    rule: 'secret-assignment',
    hit: join('const password = ', "'hunter2'"),
    pass: 'const password = process.env.VEREINO_DB_PASSWORD',
  },
  { rule: 'secret-assignment', hit: join('apiKey: ', '"A1b2C3d4E5f6"'), pass: join('apiKey: ', '"your-api-key"') },
  {
    rule: 'secret-assignment',
    hit: join('"client_secret": ', '"9f8e7d6c5b4a"'),
    pass: join('"client_secret": ', '""'),
  },
  { rule: 'email', hit: join('jan.kowalski', at, 'gmail.com'), pass: join('jan.kowalski', at, 'example.com') },
  { rule: 'email', hit: join('ops', at, 'club.pl'), pass: join('ops', at, 'club.test') },
]

test('each rule reports its pattern and lets the placeholder through', () => {
  for (const { rule, hit, pass } of RULE_CASES) {
    assert.deepEqual(
      scanLine(hit).map((found) => found.rule),
      [rule],
      `expected ${rule} for ${hit}`,
    )
    assert.deepEqual(scanLine(pass), [], `expected no hit for ${pass}`)
  }
})

test('one line can report several hits', () => {
  const line = join('a', at, 'gmail.com b', at, 'wp.pl')
  assert.deepEqual(scanLine(line), [
    { rule: 'email', match: join('a', at, 'gmail.com') },
    { rule: 'email', match: join('b', at, 'wp.pl') },
  ])
})

test('isPlaceholder recognises env lookups, template slots, masks and placeholder words', () => {
  for (const value of [
    '',
    '  ',
    '${VEREINO_TOKEN}',
    '<token>',
    '{{secret}}',
    '%SECRET%',
    'Vereino-${suffix}-Aa1!',
    'process.env.X',
    'xxxx',
    '****',
    'change-me-dev-secret',
    'your_token',
    'FAKE-123',
    'dummy',
  ]) {
    assert.equal(isPlaceholder(value), true, value)
  }
  for (const value of ['hunter2', 'S3cr3t!', 'postgres']) assert.equal(isPlaceholder(value), false, value)
})

test('isAllowedEmailDomain accepts reserved and localized placeholder domains only', () => {
  for (const domain of [
    'example.com',
    'mail.example.org',
    'club.test',
    'host.local',
    'localhost',
    'Example.PL',
    'przyklad.pl',
    'ejemplo.com',
    'your-domain.com',
  ]) {
    assert.equal(isAllowedEmailDomain(domain), true, domain)
  }
  for (const domain of ['gmail.com', 'club.pl', 'examples.com', 'acme.com'])
    assert.equal(isAllowedEmailDomain(domain), false, domain)
})

test('isMailDomain tells a mail domain from a widget injection-spot id', () => {
  assert.equal(isMailDomain('club.pl'), true)
  assert.equal(isMailDomain('club.COM'), true)
  assert.equal(isMailDomain('sales.document.detail.order'), false)
  assert.equal(scanLine(join('my.widget', at, 'customers.person.detail')).length, 0)
})

test('an e-mail-like part of a URL path is no address', () => {
  assert.deepEqual(scanLine(join('https://www.postgresql.org/message-id/1632.28', at, 'f377.i.mail.ru')), [])
})

test('isSecretValue: any password literal, but only credential-like token and key values', () => {
  assert.equal(isSecretValue('password', 'secret'), true)
  assert.equal(isSecretValue('POSTGRES_PASSWORD', 'postgres'), true)
  assert.equal(isSecretValue('password', 'change-me'), false)
  assert.equal(isSecretValue('password', 'two words'), false)
  assert.equal(isSecretValue('token', 'single'), false)
  assert.equal(isSecretValue('token', '1.abc'), false)
  assert.equal(isSecretValue('EMAIL_SENDER_TOKEN', 'foundation.emailSender'), false)
  assert.equal(isSecretValue('webhookSecret', 'vereino-integration-test-gateway'), false)
  assert.equal(isSecretValue('apiKey', 'abc123def456'), true)
})

test('keys that only start with a secret word are not assignments', () => {
  assert.deepEqual(scanLine('"tokenApplicability": "not-applicable-123"'), [])
  assert.deepEqual(scanLine('passwordRequired: "Podaj1"'), [])
})

test('isPublicHost: local, private, reserved and placeholder hosts are not public', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '[::1]',
    '0.0.0.0',
    '10.1.2.3',
    '192.168.0.10',
    '172.20.0.1',
    'postgres',
    'db.example.com',
    'db.your-domain.com',
  ]) {
    assert.equal(isPublicHost(host), false, host)
  }
  for (const host of ['db.club.pl', '172.32.0.1', 'api.github.com']) assert.equal(isPublicHost(host), true, host)
  assert.equal(isPublicHost('${host}.club.pl'), false)
})

test('isEnvFile and isCatalogFile match by path', () => {
  assert.equal(isEnvFile('.env'), true)
  assert.equal(isEnvFile('packages/app/.env.example'), true)
  assert.equal(isEnvFile('packages/app/env.ts'), false)
  assert.equal(isCatalogFile('packages/app/src/modules/people/i18n/pl.json'), true)
  assert.equal(isCatalogFile('docs/ux-concept/mockups/i18n.js'), true)
  assert.equal(isCatalogFile('packages/app/src/modules/people/lib/i18n-helpers.ts'), false)
})

test('.env files report unquoted secret assignments; other files and catalogs do not', () => {
  const line = 'AUTH_SECRET=Zx81-kq0Lm'
  assert.deepEqual(scanLine(line, { envFile: true }), [{ rule: 'secret-assignment', match: line }])
  assert.deepEqual(scanLine(line), [])
  assert.deepEqual(scanLine('export DB_PASSWORD=pa55word # local', { envFile: true }), [
    { rule: 'secret-assignment', match: 'export DB_PASSWORD=pa55word' },
  ])
  assert.deepEqual(scanLine('NEXTAUTH_SECRET=', { envFile: true }), [])
  assert.deepEqual(scanLine('JWT_SECRET=change-me-dev-secret', { envFile: true }), [])
  assert.deepEqual(scanLine('PORT=3000', { envFile: true }), [])
  const label = join('"pass', 'word": "Hasło1"')
  assert.deepEqual(scanLine(label, { catalogFile: true }), [])
  assert.deepEqual(
    scanLine(label).map((found) => found.rule),
    ['secret-assignment'],
  )
})

test('scanText numbers lines and applies the file-type rules', () => {
  const text = ['# config', 'DB_PASSWORD=pa55word', join('contact: ann', at, 'club.pl')].join('\n')
  assert.deepEqual(scanText('packages/app/.env', text), [
    { path: 'packages/app/.env', line: 2, rule: 'secret-assignment', match: 'DB_PASSWORD=pa55word' },
    { path: 'packages/app/.env', line: 3, rule: 'email', match: join('ann', at, 'club.pl') },
  ])
})

test('isBinary looks for a NUL byte', () => {
  assert.equal(isBinary(Buffer.from('plain text')), false)
  assert.equal(isBinary(Buffer.from([0x89, 0x50, 0x00, 0x47])), true)
})

test('validateAllowlist requires path, rule and reason and a non-empty optional match', () => {
  const entry = { path: 'a.ts', rule: 'email', reason: 'fixture' }
  assert.deepEqual(validateAllowlist([entry, { ...entry, match: 'x' }]), [entry, { ...entry, match: 'x' }])
  assert.throws(() => validateAllowlist({}), /must be a JSON array/)
  assert.throws(() => validateAllowlist([null]), /entry 0 needs a non-empty "path"/)
  assert.throws(() => validateAllowlist([{ ...entry, reason: ' ' }]), /entry 0 needs a non-empty "reason"/)
  assert.throws(() => validateAllowlist([entry, { ...entry, match: '' }]), /entry 1 has an empty "match"/)
  assert.throws(() => validateAllowlist([{ ...entry, match: 3 }]), /entry 0 has an empty "match"/)
})

test('isAllowed matches path and rule, and the match substring when given', () => {
  const finding = { path: 'a.ts', line: 1, rule: 'email', match: join('x', at, 'acme.com') }
  assert.equal(isAllowed(finding, [{ path: 'a.ts', rule: 'email', reason: 'r' }]), true)
  assert.equal(isAllowed(finding, [{ path: 'a.ts', rule: 'email', reason: 'r', match: 'acme.com' }]), true)
  assert.equal(isAllowed(finding, [{ path: 'a.ts', rule: 'email', reason: 'r', match: 'gmail' }]), false)
  assert.equal(isAllowed(finding, [{ path: 'b.ts', rule: 'email', reason: 'r' }]), false)
  assert.equal(isAllowed(finding, [{ path: 'a.ts', rule: 'jwt', reason: 'r' }]), false)
})

test('listTrackedFiles splits the NUL-separated git output', () => {
  const calls = []
  const exec = (command, args, options) => (calls.push({ command, args, cwd: options.cwd }), 'a.ts\0dir/b.md\0')
  assert.deepEqual(listTrackedFiles('/repo', exec), ['a.ts', 'dir/b.md'])
  assert.deepEqual(calls, [{ command: 'git', args: ['ls-files', '-z'], cwd: '/repo' }])
})

// A throwaway git repository holding the given files (relative path -> content), all tracked.
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-secrets-'))
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
    fs.writeFileSync(path.join(root, relativePath), content)
  }
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '-A'], { cwd: root })
  return root
}

test('checkSecrets scans tracked text files, skips lock, binary and missing files, applies the allow-list', () => {
  const leak = join('ann', at, 'club.pl')
  const root = makeRepo({
    'src/a.ts': `export const contact = '${leak}'\n`,
    'src/b.ts': 'export const ok = 1\n',
    'yarn.lock': `${leak}\n`,
    'logo.png': Buffer.concat([Buffer.from([0]), Buffer.from(leak)]),
    'fixtures/seed.json': `{ "owner": "${join('owner', at, 'acme.com')}" }\n`,
  })
  fs.mkdirSync(path.join(root, 'sub'))
  const files = [...listTrackedFiles(root), 'gone.ts', 'sub']
  const allowlist = [
    { path: 'fixtures/seed.json', rule: 'email', reason: 'seed', match: 'acme.com' },
    { path: 'src/b.ts', rule: 'jwt', reason: 'stale' },
  ]
  const { findings, unused } = checkSecrets(root, { files, allowlist })
  assert.deepEqual(findings, [{ path: 'src/a.ts', line: 1, rule: 'email', match: leak }])
  assert.deepEqual(unused, [allowlist[1]])
  assert.equal(checkSecrets(root).findings.length, 2)
})

test('readAllowlist returns [] without the file and validates it otherwise', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-secrets-allow-'))
  assert.deepEqual(readAllowlist(root), [])
  fs.mkdirSync(path.join(root, 'scripts'))
  fs.writeFileSync(path.join(root, ALLOWLIST_FILE), '[{"path":"a","rule":"email","reason":"r"}]')
  assert.deepEqual(readAllowlist(root), [{ path: 'a', rule: 'email', reason: 'r' }])
})

test('the allow-list file itself is never scanned', () => {
  const root = makeRepo({
    [ALLOWLIST_FILE]: `[{"path":"x","rule":"email","reason":"r","match":"${join('a', at, 'club.pl')}"}]`,
  })
  assert.deepEqual(checkSecrets(root, { allowlist: [] }).findings, [])
})

test('parseRoot reads --root and rejects other arguments', () => {
  assert.equal(parseRoot([]), process.cwd())
  assert.equal(parseRoot(['--root', '/tmp']), path.resolve('/tmp'))
  assert.throws(() => parseRoot(['--nope']), /Usage/)
})

test('mask never prints a whole secret', () => {
  assert.equal(mask('short'), '***')
  assert.equal(mask('abcdefghijkl'), 'abcdef***')
})

test('main fails with file:line [rule] for each hit and for unused allow-list entries', () => {
  const root = makeRepo({ 'a.ts': join('const pass', "word = 'hunter2'", '\n') })
  const out = []
  const err = []
  assert.equal(main({ args: ['--root', root], log: (line) => out.push(line), logError: (line) => err.push(line) }), 1)
  assert.equal(err[0], '- a.ts:1 [secret-assignment] passwo***')
  assert.match(err[1], /VEREINO_\* env variables/)

  fs.writeFileSync(path.join(root, 'a.ts'), 'const ok = 1\n')
  fs.mkdirSync(path.join(root, 'scripts'))
  fs.writeFileSync(path.join(root, ALLOWLIST_FILE), '[{"path":"a.ts","rule":"jwt","reason":"old"}]')
  err.length = 0
  assert.equal(main({ args: ['--root', root], log: () => {}, logError: (line) => err.push(line), files: ['a.ts'] }), 1)
  assert.deepEqual(err, [`- ${ALLOWLIST_FILE}: unused entry for a.ts [jwt]; remove it`])

  fs.writeFileSync(path.join(root, ALLOWLIST_FILE), '[]')
  assert.equal(main({ args: ['--root', root], log: (line) => out.push(line), logError: () => {}, files: ['a.ts'] }), 0)
  assert.equal(out.at(-1), `No secrets or real e-mail addresses found: ${root}`)
})
