// Unit tests for the runner setup `scripts/ci-runner-setup.sh` (#834): the names one runner instance derives from
// INSTANCE, its subordinate ID range, its toolchain versions, the files it writes and its isolation audits. The script
// is sourced in bash (it runs no command then) with its root-only commands replaced by shell functions.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SCRIPT = path.join(REPO_ROOT, 'scripts/ci-runner-setup.sh')

/** Runs `body` in bash after sourcing the script with `env` (and nothing else of the caller's environment). */
function bash(body, env = {}) {
  const result = spawnSync('bash', ['-c', `source "$SCRIPT"\n${body}`], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', SCRIPT, ...env },
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function config(env) {
  const { status, stdout, stderr } = bash('cmd_config', env)
  assert.equal(status, 0, stderr)
  return Object.fromEntries(
    stdout
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
}

function tempDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-runner-setup-'))
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

/** Writes the units, helpers and AppArmor profiles of one instance into a temporary directory and returns it. */
function render(env, files = {}) {
  const dir = tempDir(files)
  const { status, stderr } = bash(
    [
      'set -euo pipefail',
      'UNIT_DIR="$OUT/units"; LIBEXEC_DIR="$OUT/libexec"; APPARMOR_DIR="$OUT/aa"; mkdir -p "$APPARMOR_DIR"',
      'ci_uid() { echo 1234; }; ci_home() { echo "/home/$CI_USER"; }; systemctl() { :; }; apparmor_parser() { :; }',
      'check_settings; install_units >/dev/null; install_helpers; write_apparmor_profiles >/dev/null',
    ].join('\n'),
    { OUT: dir, ...env },
  )
  assert.equal(status, 0, stderr)
  return dir
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort()
}

test('the defaults build the Vereino instance', () => {
  const values = config({})
  assert.equal(values.instance, 'vereino-ci')
  assert.equal(values.user, 'vereino-ci')
  assert.equal(values.repo, 'wladku/Vereino')
  assert.equal(values.labels, '["self-hosted","Linux","X64","vereino-ci"]')
  assert.equal(values.token_file, '/etc/vereino-ci/github-token')
  assert.equal(values.opt_dir, '/opt/vereino-ci')
  assert.equal(values.libexec_dir, '/usr/local/libexec/vereino-ci')
  assert.equal(values.run_dir, '/run/vereino-ci')
  assert.equal(values.runner_unit, 'vereino-ci-runner@.service')
  assert.equal(values.prune_timer, 'vereino-ci-prune.timer')
  assert.equal(values.slice_dropin, 'user-<uid>.slice.d/50-vereino-ci.conf')
  assert.equal(values.apparmor_profiles, 'vereino-ci-rootlesskit vereino-ci-browsers')
  assert.equal(values.node_major, fs.readFileSync(path.join(REPO_ROOT, '.nvmrc'), 'utf8').trim())
  assert.match(values.playwright_version, /^\d+\.\d+\.\d+$/)
})

test('INSTANCE derives every name; another instance must name its repository', () => {
  const values = config({ INSTANCE: 'other-ci', REPO: 'owner/repo', SUBID_START: '2000000', CI_USER: 'other-runner' })
  assert.equal(values.user, 'other-runner')
  assert.equal(values.repo, 'owner/repo')
  assert.equal(values.labels, '["self-hosted","Linux","X64","other-ci"]')
  assert.equal(values.token_file, '/etc/other-ci/github-token')
  assert.equal(values.opt_dir, '/opt/other-ci')
  assert.equal(values.runner_unit, 'other-ci-runner@.service')
  assert.equal(values.prune_timer, 'other-ci-prune.timer')
  assert.equal(values.apparmor_profiles, 'other-ci-rootlesskit other-ci-browsers')
  assert.equal(values.subids, '2000000-2065535')
  const cases = [
    [{ INSTANCE: 'other-ci' }, /INSTANCE=other-ci needs REPO=<owner>\/<name>/],
    [{ INSTANCE: 'Other CI', REPO: 'o/r' }, /INSTANCE must be/],
    [{ CI_USER: 'root;x' }, /CI_USER must be/],
    [{ REPO: 'no-slash' }, /REPO must be/],
    [{ SLOTS: '0' }, /SLOTS must be/],
    [{ SUBID_START: 'x' }, /SUBID_START must be/],
    [{ NODE_MAJOR: 'v24' }, /NODE_MAJOR must be/],
    [{ PLAYWRIGHT_VERSION: '1.58' }, /PLAYWRIGHT_VERSION must be/],
  ]
  for (const [env, message] of cases) {
    const { status, stderr } = bash('check_settings', env)
    assert.equal(status, 1, JSON.stringify(env))
    assert.match(stderr, message)
  }
})

test('next_subid_start picks the first free block at or above 1000000 in both files', () => {
  const dir = tempDir({
    people: 'wkuc:100000:65536\n',
    vereino: 'wkuc:100000:65536\nvereino-ci:1000000:65536\n',
    gaps: 'a:1000000:65536\nb:1131072:65536\nc:1065536:1000\n# comment\n',
  })
  const next = (...files) =>
    bash(`next_subid_start ${files.map((file) => `"${path.join(dir, file)}"`).join(' ')}`).stdout.trim()
  assert.equal(next(), '1000000')
  assert.equal(next('missing'), '1000000')
  assert.equal(next('people'), '1000000')
  assert.equal(next('people', 'vereino'), '1065536')
  // c ends at 1066536, so the block 1066536-1132071 still meets b; the first free one starts where b ends.
  assert.equal(next('gaps'), '1196608')
})

test('subid_overlaps names the users whose range meets the instance user', () => {
  const dir = tempDir({ subuid: 'a:1000000:65536\nb:1065536:65536\nc:1065535:2\nd:900000:100000\n' })
  const overlaps = (user) =>
    bash(`subid_overlaps ${user} "${path.join(dir, 'subuid')}"`)
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
  assert.deepEqual(overlaps('a'), ['c'])
  assert.deepEqual(overlaps('b'), ['c'])
  assert.deepEqual(overlaps('d'), [])
  assert.equal(bash('subid_overlaps a /nonexistent; echo "status $?"').stdout.trim(), 'status 0')
})

test('the toolchain versions come from the overrides or the target repository', () => {
  const empty = tempDir()
  const pinned = tempDir({
    '.nvmrc': 'v22\n',
    'packages/app/package.json': '{ "devDependencies": { "@playwright/test": "^1.50.1" } }',
  })
  const broken = tempDir({ '.nvmrc': '22.11.0\n', 'packages/app/package.json': '{}' })
  assert.equal(bash('node_major', { REPO_ROOT: pinned }).stdout, '22\n')
  assert.equal(bash('node_major', { REPO_ROOT: empty, NODE_MAJOR: '20' }).stdout, '20\n')
  assert.match(bash('node_major', { REPO_ROOT: empty }).stderr, /no .*\.nvmrc: set NODE_MAJOR/)
  assert.match(bash('node_major', { REPO_ROOT: broken }).stderr, /must hold a major version: set NODE_MAJOR/)
  assert.equal(bash('playwright_version', { REPO_ROOT: pinned }).stdout, '1.50.1\n')
  assert.equal(bash('playwright_version', { REPO_ROOT: empty, PLAYWRIGHT_VERSION: '1.49.0' }).stdout, '1.49.0\n')
  assert.deepEqual(bash('playwright_version', { REPO_ROOT: empty }), { status: 0, stdout: '', stderr: '' })
  assert.match(
    bash('playwright_version', { REPO_ROOT: broken }).stderr,
    /no @playwright\/test version in .*: set PLAYWRIGHT_VERSION/,
  )
  const skipped = bash('npx() { echo npx "$@"; }; install_browser_libraries', { REPO_ROOT: empty })
  assert.match(skipped.stdout, /skipping the browser libraries/)
  assert.doesNotMatch(skipped.stdout, /npx/)
})

test('the default instance writes the Vereino units, helpers and profiles', () => {
  const dir = render({})
  assert.deepEqual(listFiles(dir), [
    'aa/vereino-ci-browsers',
    'aa/vereino-ci-rootlesskit',
    'libexec/jit-config',
    'libexec/run-slot',
    'units/user-1234.slice.d/50-vereino-ci.conf',
    'units/vereino-ci-prune.service',
    'units/vereino-ci-prune.timer',
    'units/vereino-ci-runner@.service',
  ])
  const unit = fs.readFileSync(path.join(dir, 'units/vereino-ci-runner@.service'), 'utf8')
  assert.match(unit, /^Description=Vereino CI runner slot %i \(ephemeral, one job per registration\)$/m)
  assert.match(unit, /^ProtectHome=tmpfs$/m)
  assert.match(unit, /^BindPaths=\/home\/vereino-ci$/m)
  const jit = fs.readFileSync(path.join(dir, 'libexec/jit-config'), 'utf8')
  assert.ok(jit.includes(`--argjson labels '["self-hosted","Linux","X64","vereino-ci"]'`))
  assert.ok(jit.includes('[ -s "/etc/vereino-ci/github-token" ]'))
  assert.ok(jit.includes('"https://api.github.com/repos/wladku/Vereino/actions/runners/generate-jitconfig"'))
})

test('another instance writes only its own names', () => {
  const dir = render({ INSTANCE: 'other-ci', REPO: 'owner/repo' })
  assert.deepEqual(listFiles(dir), [
    'aa/other-ci-browsers',
    'aa/other-ci-rootlesskit',
    'libexec/jit-config',
    'libexec/run-slot',
    'units/other-ci-prune.service',
    'units/other-ci-prune.timer',
    'units/other-ci-runner@.service',
    'units/user-1234.slice.d/50-other-ci.conf',
  ])
  for (const file of listFiles(dir)) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /vereino/i, file)
  }
  const browsers = fs.readFileSync(path.join(dir, 'aa/other-ci-browsers'), 'utf8')
  assert.match(browsers, /^profile other-ci-browsers \/home\/other-ci\/\*\*\//m)
})

test('the rootlesskit profile is left out while another profile attaches to rootlesskit', () => {
  const distro = 'profile rootlesskit /usr/bin/rootlesskit flags=(unconfined) {\n  userns,\n}\n'
  const own = 'profile other-ci-rootlesskit /usr/bin/rootlesskit flags=(unconfined) {\n}\n'
  const dir = render(
    { INSTANCE: 'other-ci', REPO: 'owner/repo' },
    { 'aa/rootlesskit': distro, 'aa/other-ci-rootlesskit': own },
  )
  assert.deepEqual(listFiles(path.join(dir, 'aa')), ['other-ci-browsers', 'rootlesskit'])
  // Its own earlier profile does not count as another one.
  const again = render(
    { INSTANCE: 'other-ci', REPO: 'owner/repo' },
    { 'aa/other-ci-rootlesskit': own, 'aa/sub/x': distro },
  )
  assert.deepEqual(listFiles(path.join(again, 'aa')), ['other-ci-browsers', 'other-ci-rootlesskit', 'sub/x'])
})

test('audit_homes warns about every home open to others, the instances under /home included', () => {
  const dir = tempDir()
  const home = (name, mode) => {
    fs.mkdirSync(path.join(dir, name))
    fs.chmodSync(path.join(dir, name), mode)
    return path.join(dir, name)
  }
  const passwd = [
    `person:x:1000:1000::${home('person', 0o755)}:/bin/bash`,
    `closed:x:1001:1001::${home('closed', 0o750)}:/bin/bash`,
    `nobody:x:65534:65534::${home('nobody', 0o777)}:/usr/sbin/nologin`,
    `daemon:x:1:1::${home('daemon', 0o755)}:/usr/sbin/nologin`,
    'gone:x:1002:1002::/nonexistent/gone:/bin/bash',
    'broken:x:abc',
  ].join('\n')
  fs.writeFileSync(path.join(dir, 'passwd'), `${passwd}\n`)
  // HOMES_DIR points away from the temporary directory, which may itself lie under /home.
  const { stdout } = bash(`HOMES_DIR=/nonexistent; audit_homes "${path.join(dir, 'passwd')}"`)
  assert.equal(
    stdout,
    `[ci-runner-setup] WARNING: ${dir}/person is open to other users (755); run: chmod o-rwx ${dir}/person\n`,
  )
  // A system user's home under /home is audited too: that is where the other runner instances live.
  const homes = path.join(dir, 'homes')
  fs.mkdirSync(path.join(homes, 'other-ci'), { recursive: true })
  fs.chmodSync(path.join(homes, 'other-ci'), 0o755)
  fs.writeFileSync(path.join(dir, 'instance'), `other-ci:x:990:990::${homes}/other-ci:/usr/sbin/nologin\n`)
  assert.match(
    bash(`HOMES_DIR="${homes}"; audit_homes "${path.join(dir, 'instance')}"`).stdout,
    /WARNING: .*\/homes\/other-ci is open/,
  )
  assert.equal(
    bash(`HOMES_DIR=/nonexistent; audit_homes "${path.join(dir, 'instance')}"`).stdout,
    '[ci-runner-setup] home directories: none open to other users\n',
  )
  fs.writeFileSync(path.join(dir, 'passwd'), `closed:x:1001:1001::${dir}/closed:/bin/bash\n`)
  assert.equal(
    bash(`HOMES_DIR=/nonexistent; audit_homes "${path.join(dir, 'passwd')}"`).stdout,
    '[ci-runner-setup] home directories: none open to other users\n',
  )
})

test('audit_subids warns when the instance user shares subordinate IDs', () => {
  const { stdout } = bash('subid_overlaps() { [ "$2" = /etc/subuid ] && printf "a\\nb\\n"; return 0; }; audit_subids', {
    CI_USER: 'other-ci',
  })
  assert.equal(
    stdout,
    '[ci-runner-setup] WARNING: the range of other-ci in /etc/subuid overlaps the range of: a b (give each user its own range)\n',
  )
  assert.equal(bash('subid_overlaps() { return 0; }; audit_subids').stdout, '')
})

test('the script prints its usage without a command and runs nothing when sourced', () => {
  const usage = spawnSync('bash', [SCRIPT], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stdout, /scripts\/ci-runner-setup\.sh config/)
  assert.equal(bash('echo sourced').stdout, 'sourced\n')
})
