// Unit tests for the workflow runner guard `scripts/check-ci-runners.mjs` (#834).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  checkRepository,
  checkWorkflow,
  HOSTED_RUNS_ON,
  parseRunsOn,
  runCli,
  SELF_HOSTED_JOBS,
  SELF_HOSTED_RUNS_ON,
  SELF_HOSTED_WORKFLOW,
} from '../../../../scripts/check-ci-runners.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function job(name, runsOn) {
  return `  ${name}:\n    name: ${name}\n    runs-on: ${runsOn}\n    steps:\n      - run: echo ${name}\n`
}

function ciWorkflow(overrides = {}) {
  const jobs = ['changes', ...SELF_HOSTED_JOBS]
    .map((name) => job(name, overrides[name] ?? (name === 'changes' ? HOSTED_RUNS_ON : SELF_HOSTED_RUNS_ON)))
    .join('\n')
  return `# CI\nname: CI\non:\n  pull_request:\n  push:\njobs:\n${jobs}`
}

function tempRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-ci-runners-'))
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

test('the repository workflows pass', () => {
  assert.deepEqual(checkRepository(REPO_ROOT).errors, [])
})

test('the expression sends only pushes and same-repository PRs to vereino-ci, behind CI_SELF_HOSTED', () => {
  assert.match(SELF_HOSTED_RUNS_ON, /^\$\{\{ vars\.CI_SELF_HOSTED == 'true' && /)
  assert.match(SELF_HOSTED_RUNS_ON, /github\.event_name == 'push' \|\| \(github\.event_name == 'pull_request' && /)
  assert.match(SELF_HOSTED_RUNS_ON, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/)
  assert.match(SELF_HOSTED_RUNS_ON, /\|\| 'ubuntu-latest' \}\}$/)
})

test('parseRunsOn names the job of each runs-on and ignores keys outside jobs', () => {
  const source = [
    '# jobs:',
    'on:',
    '  push:',
    'runs-on: top-level',
    'jobs:',
    '  # a comment',
    '  build:',
    '    runs-on: ubuntu-latest  ',
    '    strategy:',
    '      matrix:',
    '        runs-on: nested',
    '  test-2:\r',
    '    runs-on: x',
    'env:',
    '  A: 1',
  ].join('\n')
  assert.deepEqual(parseRunsOn(source), [
    { job: null, line: 4, value: 'top-level' },
    { job: 'build', line: 8, value: 'ubuntu-latest' },
    { job: 'build', line: 11, value: 'nested' },
    { job: 'test-2', line: 13, value: 'x' },
  ])
})

test('ci.yml passes with hosted jobs and the expression on every self-hosted job', () => {
  assert.deepEqual(checkWorkflow(SELF_HOSTED_WORKFLOW, ciWorkflow()), [])
})

test('ci.yml fails on another runner value, a missing expression or a missing job', () => {
  const tampered = SELF_HOSTED_RUNS_ON.replace("github.event_name == 'push' || ", '')
  assert.deepEqual(checkWorkflow(SELF_HOSTED_WORKFLOW, ciWorkflow({ gate: tampered, perf: HOSTED_RUNS_ON })), [
    `${SELF_HOSTED_WORKFLOW}:15 (job gate): runs-on must be ubuntu-latest or the self-hosted expression of scripts/check-ci-runners.mjs`,
    `${SELF_HOSTED_WORKFLOW}:15 (job gate): must use the self-hosted expression`,
    `${SELF_HOSTED_WORKFLOW}:39 (job perf): must use the self-hosted expression`,
  ])
  const withoutImageSmoke = ciWorkflow().replace(job('image-smoke', SELF_HOSTED_RUNS_ON), '')
  assert.deepEqual(checkWorkflow(SELF_HOSTED_WORKFLOW, withoutImageSmoke), [
    `${SELF_HOSTED_WORKFLOW}: job image-smoke has no runs-on`,
  ])
})

test('another workflow may not use the expression or name a self-hosted runner anywhere', () => {
  const source = `on:\n  pull_request_target:\njobs:\n${job('train', SELF_HOSTED_RUNS_ON)}${job('b', '[self-hosted]')}  c:\n    env:\n      LABEL: vereino-ci\n    # vereino-ci in a comment is fine\n`
  assert.deepEqual(checkWorkflow('.github/workflows/merge-train.yml', source), [
    '.github/workflows/merge-train.yml:6 (job train): runs-on must be ubuntu-latest (only .github/workflows/ci.yml may use self-hosted runners)',
    '.github/workflows/merge-train.yml:11 (job b): runs-on must be ubuntu-latest (only .github/workflows/ci.yml may use self-hosted runners)',
    '.github/workflows/merge-train.yml:16: names a self-hosted runner outside runs-on',
  ])
  assert.deepEqual(checkWorkflow('.github/workflows/top.yml', 'runs-on: macos-latest\n'), [
    '.github/workflows/top.yml:1: runs-on must be ubuntu-latest (only .github/workflows/ci.yml may use self-hosted runners)',
  ])
})

test('checkRepository reads .yml and .yaml files and requires ci.yml', () => {
  const good = tempRepo({
    [SELF_HOSTED_WORKFLOW]: ciWorkflow(),
    '.github/workflows/other.yaml': `jobs:\n${job('x', HOSTED_RUNS_ON)}`,
    '.github/workflows/README.md': 'self-hosted',
  })
  assert.deepEqual(checkRepository(good), { files: 2, errors: [] })
  const noCi = tempRepo({ '.github/workflows/other.yml': `jobs:\n${job('x', 'self-hosted')}` })
  assert.deepEqual(checkRepository(noCi), {
    files: 1,
    errors: [
      '.github/workflows/other.yml:4 (job x): runs-on must be ubuntu-latest (only .github/workflows/ci.yml may use self-hosted runners)',
      `${SELF_HOSTED_WORKFLOW}: file not found`,
    ],
  })
  assert.deepEqual(checkRepository(tempRepo({})), { files: 0, errors: ['.github/workflows: directory not found'] })
})

test('runCli reports success, problems and honours --root', () => {
  const lines = []
  const errors = []
  const log = (line) => lines.push(line)
  const error = (line) => errors.push(line)
  assert.equal(runCli({ argv: [], cwd: REPO_ROOT, log, error }), 0)
  assert.match(lines[0], /^ci-runners:check: \d+ workflow\(s\)/)
  const bad = tempRepo({ [SELF_HOSTED_WORKFLOW]: ciWorkflow({ gate: '[self-hosted]' }) })
  assert.equal(runCli({ argv: ['--root', bad], cwd: REPO_ROOT, log, error }), 1)
  assert.equal(errors.at(-1), 'ci-runners:check: 2 problem(s)')
  assert.equal(runCli({ argv: ['--root'], cwd: bad, log, error }), 1)
  // The default writers print to the console.
  assert.equal(runCli({ argv: ['--root', REPO_ROOT] }), 0)
  assert.equal(runCli({ argv: ['--root', bad] }), 1)
})
