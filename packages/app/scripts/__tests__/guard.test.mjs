// Unit tests for the change guard (`yarn guard`, #520): one hit and one allowed case per rule.
// Every test marker and sample secret is assembled from parts, so this test file passes the guard and the
// secrets scan itself.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  APPROVAL_LABEL,
  checkAgentRules,
  checkCoverage,
  checkDeletedTests,
  checkLockfile,
  checkPackageJson,
  checkSecretsInDiff,
  checkTestMarkers,
  collectFindings,
  isAgentRuleFile,
  isTestFile,
  issueReader,
  lineOfKey,
  lockPackages,
  main,
  makeGh,
  parseArgs,
  parseDiff,
  parseNameStatus,
  prLabels,
  quarantineIssue,
  quarantineVerdict,
  renderReport,
} from '../../../../scripts/guard.mjs'

const j = (...parts) => parts.join('')
const SKIP = j('test', '.skip(')
const DESCRIBE_SKIP = j('describe', '.skip(')
const ONLY = j('it', '.only(')
const XIT = j('x', 'it(')
const FIXME = j('test', '.fixme(')
const QUARANTINE = (n) => j('// quarantine', `: #${String(n)}`)
const noIssue = () => null
const openBug = () => ({ state: 'OPEN', labels: ['bug'] })

test('isTestFile knows unit, script and integration tests', () => {
  for (const file of [
    'packages/app/src/modules/a/lib/__tests__/x.ts',
    'packages/core/src/money.test.ts',
    'packages/ui/src/a.spec.tsx',
    'packages/app/scripts/__tests__/backup-drill.e2e.mjs',
    'packages/app/.ai/qa/tests/members/TEST-001.spec.ts',
  ]) {
    assert.equal(isTestFile(file), true, file)
  }
  for (const file of ['packages/app/src/modules/a/lib/x.ts', 'README.md', 'scripts/guard.mjs']) {
    assert.equal(isTestFile(file), false, file)
  }
})

test('isAgentRuleFile flags rule files and never lessons', () => {
  for (const file of [
    'AGENTS.md',
    'packages/app/AGENTS.md',
    'CLAUDE.md',
    '.agents/skills/x/SKILL.md',
    '.ai/skills/om-auto-fix-issue/SKILL.md',
    '.github/workflows/ci.yml',
    'scripts/verify.mjs',
    'scripts/guard.mjs',
  ]) {
    assert.equal(isAgentRuleFile(file), true, file)
  }
  for (const file of ['.ai/lessons/x.md', 'scripts/check-secrets.mjs', 'docs/AGENTS.txt']) {
    assert.equal(isAgentRuleFile(file), false, file)
  }
})

test('parseNameStatus reads plain, renamed and copied entries', () => {
  assert.deepEqual(parseNameStatus('M\0a.ts\0R087\0old.test.ts\0new.ts\0C100\0x\0y\0D\0z\0'), [
    { status: 'M', path: 'a.ts' },
    { status: 'R', from: 'old.test.ts', path: 'new.ts' },
    { status: 'C', from: 'x', path: 'y' },
    { status: 'D', path: 'z' },
  ])
  assert.deepEqual(parseNameStatus(''), [])
})

test('parseDiff numbers added and removed lines and skips deleted files', () => {
  const diff = [
    'diff --git a.ts a.ts',
    'index 1..2 100644',
    '--- a.ts',
    '+++ a.ts',
    '@@ -3 +3,2 @@ context',
    '-old',
    '+new',
    '+newer',
    '@@ -10,0 +12 @@',
    '+tail',
    'diff --git gone.ts gone.ts',
    'deleted file mode 100644',
    '--- gone.ts',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    'diff --git with space.ts with space.ts',
    '--- /dev/null',
    '+++ with space.ts\t',
    '@@ -0,0 +1 @@',
    '+hi',
    'Binary files differ',
  ].join('\n')
  const files = parseDiff(diff)
  assert.deepEqual([...files.keys()], ['a.ts', 'with space.ts'])
  assert.deepEqual(files.get('a.ts'), {
    added: [{ line: 3, text: 'new' }, { line: 4, text: 'newer' }, { line: 12, text: 'tail' }],
    removed: [{ line: 3, text: 'old' }],
  })
  assert.deepEqual(files.get('with space.ts').added, [{ line: 1, text: 'hi' }])
})

test('checkDeletedTests blocks a deleted or renamed-away test and allows a moved one', () => {
  const findings = checkDeletedTests([
    { status: 'D', path: 'src/a.test.ts' },
    { status: 'D', path: 'src/a.ts' },
    { status: 'R', from: 'src/b.test.ts', path: 'src/b.ts' },
    { status: 'R', from: 'src/c.test.ts', path: 'src/__tests__/c.test.ts' },
    { status: 'M', path: 'src/d.test.ts' },
  ])
  assert.deepEqual(findings.map((f) => [f.rule, f.file]), [
    ['test-deleted', 'src/a.test.ts'],
    ['test-deleted', 'src/b.test.ts'],
  ])
  assert.match(findings[1].message, /renamed away to src\/b\.ts/)
})

test('checkTestMarkers blocks skip, only and x-prefixed tests in test files only', () => {
  const added = [
    { line: 1, text: `${SKIP}'a', () => {})` },
    { line: 2, text: `  ${DESCRIBE_SKIP}'b', () => {})` },
    { line: 3, text: `${ONLY}'c', () => {})` },
    { line: 4, text: `${XIT}'d', () => {})` },
    { line: 5, text: "test('fine', () => {})" },
    { line: 6, text: 'const box = fixit(1)' },
  ]
  const io = { readLines: () => [], issueOf: noIssue }
  assert.deepEqual(checkTestMarkers('src/a.test.ts', added, io).map((f) => [f.rule, f.line]), [
    ['test-skip', 1],
    ['test-skip', 2],
    ['test-only', 3],
    ['test-skip', 4],
  ])
  assert.deepEqual(checkTestMarkers('src/a.ts', added, io), [])
  assert.deepEqual(checkTestMarkers('src/__tests__/notes.md', added, io), [])
})

test('checkTestMarkers allows a fixme quarantined by an open bug issue and blocks every other fixme', () => {
  const lines = [
    `${FIXME}'a', () => {}) ${QUARANTINE(7)}`,
    QUARANTINE(8),
    `${FIXME}'b', () => {})`,
    `${FIXME}'c', () => {})`,
  ]
  const added = [1, 3, 4].map((line) => ({ line, text: lines[line - 1] }))
  const issues = { 7: openBug(), 8: openBug() }
  const io = { readLines: () => lines, issueOf: (n) => issues[n] ?? null }
  assert.deepEqual(checkTestMarkers('a.spec.ts', added, io).map((f) => [f.rule, f.line, f.message]), [
    ['test-fixme', 4, 'fixme without `// quarantine: #<open bug issue>`'],
  ])
  const closed = { readLines: () => lines, issueOf: () => ({ state: 'CLOSED', labels: ['bug'] }) }
  assert.match(checkTestMarkers('a.spec.ts', added.slice(0, 1), closed)[0].message, /#7 is not open/)
})

test('quarantineIssue reads the same line or the line above', () => {
  const lines = ['x', QUARANTINE(12), 'y', `z ${QUARANTINE(13)}`]
  assert.equal(quarantineIssue(lines, 3), 12)
  assert.equal(quarantineIssue(lines, 4), 13)
  assert.equal(quarantineIssue(lines, 1), null)
  assert.equal(quarantineIssue([], 5), null)
})

test('quarantineVerdict needs a readable, open issue labelled bug', () => {
  assert.deepEqual(quarantineVerdict(1, openBug()), { ok: true })
  assert.match(quarantineVerdict(1, null).reason, /could not be read/)
  assert.match(quarantineVerdict(1, { state: 'CLOSED', labels: ['bug'] }).reason, /not open/)
  assert.match(quarantineVerdict(1, { state: 'OPEN', labels: ['enhancement'] }).reason, /no `bug` label/)
})

test('checkCoverage blocks a lowered or removed threshold and allows an unchanged or raised one', () => {
  const lowered = checkCoverage('packages/app/jest.config.cjs', {
    removed: [{ line: 21, text: '{ lines: 100, branches: 100, functions: 100, statements: 100 }' }],
    added: [{ line: 21, text: '{ lines: 90, branches: 100, functions: 100 }' }],
  })
  assert.deepEqual(lowered.map((f) => [f.rule, f.line, f.message]), [
    ['coverage-threshold', 21, '`lines` threshold lowered from 100 to 90'],
    ['coverage-threshold', 21, '`statements` threshold removed (was 100)'],
  ])
  assert.equal(lowered[1].oldLine, true)
  assert.deepEqual(
    checkCoverage('packages/app/jest.config.cjs', {
      removed: [{ line: 1, text: 'lines: 90,' }],
      added: [{ line: 1, text: 'lines: 100,' }],
    }),
    [],
  )
  const flags = checkCoverage('packages/app/package.json', {
    removed: [{ line: 34, text: '"test:scripts": "node --test --test-coverage-lines=100 --test-coverage-branches=100"' }],
    added: [{ line: 34, text: '"test:scripts": "node --test --test-coverage-lines=95 --test-coverage-branches=100"' }],
  })
  assert.deepEqual(flags.map((f) => f.message), ['`lines` threshold lowered from 100 to 95'])
  assert.deepEqual(
    checkCoverage('jest.config.cjs', {
      removed: [{ line: 1, text: 'lines: 100,' }],
      added: [{ line: 1, text: 'lines: 100,' }, { line: 9, text: 'lines: 80,' }, { line: 12, text: 'lines: 90,' }],
    }).map((f) => [f.line, f.message]),
    [[9, '`lines` threshold lowered from 100 to 80']],
  )
  assert.deepEqual(checkCoverage('src/a.ts', { removed: [{ line: 1, text: 'lines: 100' }], added: [] }), [])
})

test('checkCoverage blocks a new exclusion and allows an unchanged one', () => {
  const script = (excludes) => `"test:scripts": "node --test ${excludes.map((e) => `--test-coverage-exclude=\\"${e}\\"`).join(' ')}"`
  const added = checkCoverage('packages/app/package.json', {
    removed: [{ line: 34, text: script(['../../scripts/a.mjs']) }],
    added: [{ line: 34, text: script(['../../scripts/a.mjs', '../../scripts/b.mjs']) }],
  })
  assert.deepEqual(added.map((f) => [f.rule, f.message]), [['coverage-exclusion', 'new exclusion `../../scripts/b.mjs`']])
  const jest = checkCoverage('jest.config.js', {
    removed: [{ line: 5, text: "testPathIgnorePatterns: ['/node_modules/']," }],
    added: [
      { line: 5, text: "testPathIgnorePatterns: ['/node_modules/', '/payments/']," },
      { line: 6, text: "collectCoverageFrom: ['src/**/*.ts', '!src/legacy/**']," },
      { line: 7, text: "coveragePathIgnorePatterns: ['/generated/']," },
    ],
  })
  assert.deepEqual(jest.map((f) => [f.line, f.message]), [
    [5, 'new exclusion `/payments/`'],
    [6, 'new exclusion `!src/legacy/**`'],
    [7, 'new exclusion `/generated/`'],
  ])
})

test('checkPackageJson blocks a new dependency and allows a version change', () => {
  const before = JSON.stringify({ dependencies: { a: '1.0.0' }, devDependencies: { b: '1.0.0' } }, null, 2)
  const after = JSON.stringify(
    { dependencies: { a: '2.0.0', c: '1.0.0' }, devDependencies: { b: '1.0.0' }, resolutions: { d: '1.0.0' } },
    null,
    2,
  )
  assert.deepEqual(checkPackageJson('package.json', before, after).map((f) => [f.rule, f.line, f.message]), [
    ['new-dependency', 4, '`c` added to `dependencies`'],
    ['new-dependency', 10, '`d` added to `resolutions`'],
  ])
  assert.deepEqual(checkPackageJson('package.json', before, before.replace('1.0.0', '1.0.1')), [])
  assert.deepEqual(checkPackageJson('package.json', '{ broken', '{ broken'), [])
  assert.equal(checkPackageJson('packages/new/package.json', '', '{"dependencies":{"x":"1"}}').length, 1)
})

test('lineOfKey finds the key line or 0', () => {
  assert.equal(lineOfKey('{\n  "a": 1\n}', 'a'), 2)
  assert.equal(lineOfKey('{}', 'a'), 0)
})

test('lockPackages reads every top-level descriptor of a Yarn Berry lockfile', () => {
  const lock = [
    '__metadata:',
    '  version: 8',
    '',
    '"@babel/core@npm:^7.0.0, @babel/core@npm:^7.1.0":',
    '  version: 7.1.0',
    '',
    '"lodash@npm:4.18.1":',
    '  version: 4.18.1',
    '"vereino@workspace:.":',
    '  version: 0.0.0',
    'bare:',
  ].join('\n')
  assert.deepEqual([...lockPackages(lock)], [['@babel/core', 4], ['lodash', 7], ['vereino', 9], ['bare', 11]])
})

test('checkLockfile blocks a new package and allows a version bump', () => {
  const before = '"a@npm:^1.0.0":\n  version: 1.0.0\n'
  assert.deepEqual(checkLockfile('yarn.lock', before, '"a@npm:^1.1.0":\n  version: 1.1.0\n'), [])
  assert.deepEqual(
    checkLockfile('yarn.lock', before, `${before}"b@npm:^2.0.0":\n  version: 2.0.0\n`).map((f) => [f.rule, f.line, f.message]),
    [['new-lock-package', 3, '`b` is new in the lockfile']],
  )
})

test('checkSecretsInDiff reuses the secrets matcher and its allow-list on added lines', () => {
  const secret = j('const password = ', "'hunter2'")
  const added = [{ line: 4, text: secret }, { line: 5, text: 'const password = process.env.X' }]
  assert.deepEqual(checkSecretsInDiff('src/a.ts', added, []).map((f) => [f.rule, f.line]), [['secret:secret-assignment', 4]])
  assert.deepEqual(checkSecretsInDiff('src/a.ts', added, [{ path: 'src/a.ts', rule: 'secret-assignment', reason: 'r' }]), [])
  assert.deepEqual(checkSecretsInDiff('yarn.lock', added, []), [])
  assert.deepEqual(checkSecretsInDiff('.env.local', [{ line: 1, text: j('AUTH_SECRET', '=A1b2C3d4E5f6') }], []).length, 1)
})

test('checkAgentRules warns once per changed rule file, never for lessons', () => {
  assert.deepEqual(
    checkAgentRules([
      { status: 'M', path: 'AGENTS.md' },
      { status: 'M', path: '.ai/lessons/x.md' },
      { status: 'R', from: '.ai/skills/a/SKILL.md', path: '.ai/skills/b/SKILL.md' },
      { status: 'D', path: 'AGENTS.md' },
    ]).map((w) => [w.rule, w.file]),
    [
      ['agent-rules', 'AGENTS.md'],
      ['agent-rules', '.ai/skills/a/SKILL.md'],
      ['agent-rules', '.ai/skills/b/SKILL.md'],
    ],
  )
})

test('collectFindings combines every rule', () => {
  const files = {
    'src/a.test.ts': `${SKIP}'a', () => {})\n`,
    'package.json': '{"dependencies":{"x":"1"}}',
    'yarn.lock': '"x@npm:1":\n  version: 1\n',
  }
  const result = collectFindings({
    nameStatus: 'M\0src/a.test.ts\0M\0package.json\0M\0yarn.lock\0D\0src/b.test.ts\0M\0AGENTS.md\0R100\0old/package.json\0new/package.json\0',
    diff: ['+++ src/a.test.ts', '@@ -0,0 +1 @@', `+${SKIP}'a', () => {})`].join('\n'),
    readOld: (file) => (file === 'old/package.json' ? '{"dependencies":{"y":"1"}}' : ''),
    readNew: (file) => files[file] ?? (file === 'new/package.json' ? '{"dependencies":{"y":"1"}}' : ''),
    issueOf: noIssue,
    allowlist: [],
  })
  assert.deepEqual(result.blocking.map((f) => f.rule), ['test-deleted', 'test-skip', 'new-dependency', 'new-lock-package'])
  assert.deepEqual(result.warnings.map((w) => w.file), ['AGENTS.md'])
})

test('renderReport passes clean, blocks findings and honours the approval label', () => {
  const clean = renderReport({ blocking: [], warnings: [], approved: false, base: 'abc' })
  assert.equal(clean.exitCode, 0)
  assert.match(clean.markdown, /No blocking findings/)
  const finding = { rule: 'test-skip', file: 'a.test.ts', line: 3, message: 'm' }
  const removed = { rule: 'coverage-threshold', file: 'jest.config.cjs', line: 2, message: 'm', oldLine: true }
  const deleted = { rule: 'test-deleted', file: 'b.test.ts', message: 'm' }
  const warning = { rule: 'agent-rules', file: 'AGENTS.md', message: 'w' }
  const blocked = renderReport({ blocking: [finding, removed, deleted], warnings: [warning], approved: false, base: 'abc' })
  assert.equal(blocked.exitCode, 1)
  assert.match(blocked.markdown, /`a\.test\.ts:3` \[test-skip\]/)
  assert.match(blocked.markdown, /`jest\.config\.cjs:2 \(base\)`/)
  assert.match(blocked.markdown, /`b\.test\.ts` \[test-deleted\]/)
  assert.match(blocked.markdown, /Warnings \(1, not blocking\)/)
  assert.match(blocked.markdown, /Never work around the guard/)
  const approved = renderReport({ blocking: [finding], warnings: [], approved: true, base: 'abc' })
  assert.equal(approved.exitCode, 0)
  assert.match(approved.markdown, new RegExp(`carries \`${APPROVAL_LABEL}\``))
  assert.equal(renderReport({ blocking: [], warnings: [warning], approved: false, base: 'abc' }).exitCode, 0)
})

test('parseArgs reads base, pr and root and rejects anything else', () => {
  assert.deepEqual(parseArgs([]), { base: undefined, pr: undefined, root: process.cwd() })
  assert.deepEqual(parseArgs(['--base', 'HEAD^1', '--pr', '12', '--root', '/tmp']), { base: 'HEAD^1', pr: '12', root: path.resolve('/tmp') })
  assert.throws(() => parseArgs(['--base']), /Usage/)
  assert.throws(() => parseArgs(['--nope', 'x']), /Usage/)
})

test('makeGh parses JSON and turns every failure into null', () => {
  assert.deepEqual(makeGh('/', () => '{"a":1}')(['x']), { a: 1 })
  assert.equal(makeGh('/', () => { throw new Error('no gh') })(['x']), null)
})

test('issueReader caches lookups and maps labels to names', () => {
  let calls = 0
  const read = issueReader(() => {
    calls += 1
    return { state: 'OPEN', labels: [{ name: 'bug' }] }
  })
  assert.deepEqual(read(5), { state: 'OPEN', labels: ['bug'] })
  read(5)
  assert.equal(calls, 1)
  assert.equal(issueReader(() => null)(6), null)
})

test('prLabels reads the PR labels, or none without a PR or a readable PR', () => {
  assert.deepEqual(prLabels(() => ({ labels: [{ name: APPROVAL_LABEL }] }), '3'), [APPROVAL_LABEL])
  assert.deepEqual(prLabels(() => null, '3'), [])
  assert.deepEqual(prLabels(() => { throw new Error('not called') }, undefined), [])
})

// A throwaway repository with `main` as `origin/main`, for end-to-end runs of `main()`.
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'guard@example.com')
  git('config', 'user.name', 'guard')
  git('config', 'commit.gpgsign', 'false')
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  write('package.json', JSON.stringify({ name: 'x', dependencies: { a: '1.0.0' } }, null, 2))
  write('src/a.test.ts', "test('a', () => {})\n")
  write('src/b.test.ts', "test('b', () => {})\n")
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  git('checkout', '-q', '-b', 'feature')
  return { root, git, write }
}

// Real git; `gh` answers from `ghAnswers` (by its first two arguments) or fails.
function execWith(ghAnswers) {
  return (command, args, options) => {
    if (command === 'git') return execFileSync(command, args, options)
    const answer = ghAnswers[`${args[0]} ${args[1]} ${args[2]}`]
    if (answer === undefined) throw new Error('gh unavailable')
    return JSON.stringify(answer)
  }
}

test('main passes an unchanged branch and writes the job summary', (t) => {
  const { root } = makeRepo()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const out = []
  const summary = path.join(root, 'summary.md')
  const code = main({
    args: ['--root', root],
    log: (text) => out.push(text),
    logError: () => assert.fail('no error expected'),
    env: { GITHUB_STEP_SUMMARY: summary },
    exec: execWith({}),
  })
  assert.equal(code, 0)
  assert.match(out.join(''), /No blocking findings/)
  assert.match(fs.readFileSync(summary, 'utf8'), /## yarn guard/)
})

test('main blocks a skipped test, a deleted test and a new dependency until the PR is approved', (t) => {
  const { root, git, write } = makeRepo()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  write('src/a.test.ts', `test('a', () => {})\n${SKIP}'c', () => {})\n`)
  write('package.json', JSON.stringify({ name: 'x', dependencies: { a: '1.0.0', left: '1.0.0' } }, null, 2))
  write('AGENTS.md', '# rules\n')
  git('rm', '-q', 'src/b.test.ts')
  git('add', '-A')
  git('commit', '-q', '-m', 'weaken')
  const err = []
  const code = main({ args: ['--root', root, '--pr', '9'], log: () => {}, logError: (text) => err.push(text), env: {}, exec: execWith({}) })
  assert.equal(code, 1)
  const report = err.join('')
  assert.match(report, /`src\/a\.test\.ts:2` \[test-skip\]/)
  assert.match(report, /`src\/b\.test\.ts` \[test-deleted\]/)
  assert.match(report, /`package\.json:5` \[new-dependency\]/)
  assert.match(report, /`AGENTS\.md` \[agent-rules\]/)
  const out = []
  const approved = main({
    args: ['--root', root, '--pr', '9'],
    log: (text) => out.push(text),
    logError: () => assert.fail('approved run must pass'),
    env: {},
    exec: execWith({ 'pr view 9': { labels: [{ name: APPROVAL_LABEL }] } }),
  })
  assert.equal(approved, 0)
  assert.match(out.join(''), /owner approved/)
})

test('main allows a quarantined fixme, reads an explicit base and treats an unreadable base file as new', (t) => {
  const { root, git, write } = makeRepo()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  write('src/a.test.ts', `${QUARANTINE(41)}\n${FIXME}'a', () => {})\n`)
  write('packages/new/package.json', '{"name":"n"}')
  git('add', '-A')
  git('commit', '-q', '-m', 'quarantine')
  const exec = execWith({ 'issue view 41': { state: 'OPEN', labels: [{ name: 'bug' }] } })
  assert.equal(main({ args: ['--root', root], log: () => {}, logError: () => assert.fail('quarantine must pass'), env: {}, exec }), 0)
  const err = []
  assert.equal(main({ args: ['--root', root, '--base', 'main'], log: () => {}, logError: (text) => err.push(text), env: {}, exec: execWith({}) }), 1)
  assert.match(err.join(''), /#41 could not be read/)
  const missing = { args: ['--root', root], log: () => {}, logError: (text) => err.push(text), env: {}, exec, exists: () => false }
  assert.equal(main(missing), 1)
  assert.match(err.at(-1), /fixme without/)
  assert.equal(main({ args: ['--root', root, '--base', 'HEAD'], log: () => {}, logError: () => assert.fail('empty diff passes'), env: {}, exec: execWith({}) }), 0)
})
